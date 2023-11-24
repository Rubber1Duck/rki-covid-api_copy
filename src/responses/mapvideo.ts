import { stringify } from "svgson";
import DistrictsMap from "../maps/districts.json";
import StatesMap from "../maps/states.json";
import { weekIncidenceColorRanges } from "../configuration/colors";
import sharp from "sharp";
import { getColorForValue, getMapBackground } from "./map";
import { getDistrictByAGS, DistrictsCasesHistoryResponse } from "./districts";
import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import {
  getMetaData,
  getDateBeforeDate,
  MetaData,
  getStateIdByAbbreviation,
} from "../utils";
import { getDistrictsData } from "../data-requests/districts";
import { getStatesData } from "../data-requests/states";
import { StatesCasesHistoryResponse, getStateById } from "./states";
import { getTestingHistory } from "../data-requests/testing";

interface Status {
  districts: boolean;
  states: boolean;
  videos: {
    districts: {
      filename: string;
      created: number;
    }[];
    states: {
      filename: string;
      created: number;
    }[];
  };
}

function ffmpegSync(
  framesNameSearch: string,
  mp4FileName: string,
  frameRate: string,
  startFrame: string,
  lockFileName: string
) {
  return new Promise<{ filename: string }>((resolve, reject) => {
    ffmpeg()
      .input(framesNameSearch)
      .inputOptions("-framerate", frameRate)
      .inputOptions("-start_number", startFrame)
      .videoCodec("libx264")
      .outputOptions("-pix_fmt", "yuv420p")
      .saveToFile(mp4FileName)
      .on("end", () => {
        resolve({ filename: mp4FileName });
      })
      .on("error", (err, stdout, stderr) => {
        fs.rmSync(lockFileName);
        console.log("ffmpeg stdout:\n" + stdout);
        console.log("ffmpeg stderr:\n" + stderr);
        return reject(new Error(err));
      });
  });
}

export enum Region {
  districts = "districts",
  states = "states",
}

interface ColorsPerDay {
  [dateString: string]: {
    [key: string]: {
      color: string;
    };
  };
}

interface MAMDayEntry {
  sum: number;
  count: number;
  avg: number;
  avgColor: string;
  min: number;
  minColor: string;
  max: number;
  maxColor: string;
}

interface MAMPerDay {
  [dateString: string]: MAMDayEntry;
}

export interface MAM {
  iCol: string;
  name: string;
  nCol: string;
}

export interface MAMGrouped {
  [incidenceColor: string]: {
    rInd: number;
    name: string;
    nCol: string;
  }[];
}

export async function ColorsPerDay(
  metaData: MetaData,
  region: Region
): Promise<ColorsPerDay> {
  // initialize history and regions data variable
  const start = new Date().getTime();
  let regionsCasesHistory;
  let regionsData;
  // request the data depending on region
  if (region == Region.districts) {
    regionsCasesHistory = (
      await DistrictsCasesHistoryResponse(null, null, metaData)
    ).data;
    regionsData = await getDistrictsData(metaData);
  } else if (region == Region.states) {
    regionsCasesHistory = (
      await StatesCasesHistoryResponse(null, null, metaData)
    ).data;
    regionsData = await getStatesData(metaData);
  }
  const colorsPerDay: ColorsPerDay = {};
  const mAMPerDay: MAMPerDay = {};
  // build region incidence color history
  for (const key of Object.keys(regionsCasesHistory)) {
    const regionHistory = regionsCasesHistory[key].history;
    const keyToUse =
      region == Region.districts
        ? key
        : getStateIdByAbbreviation(key).toString();
    const regionData =
      region == Region.districts
        ? getDistrictByAGS(regionsData, keyToUse)
        : getStateById(regionsData, parseInt(keyToUse));
    for (let i = 6; i < regionHistory.length; i++) {
      const date = regionHistory[i].date;
      let sum = 0;
      for (let dayOffset = i; dayOffset > i - 7; dayOffset--) {
        sum += regionHistory[dayOffset].cases;
      }
      const incidence = (sum / regionData.population) * 100000;
      const incidenceColor = getColorForValue(
        incidence,
        weekIncidenceColorRanges
      );
      if (!colorsPerDay[date.toISOString()]) {
        colorsPerDay[date.toISOString()] = {
          [keyToUse]: { color: incidenceColor },
        };
      } else {
        colorsPerDay[date.toISOString()][keyToUse] = { color: incidenceColor };
      }
      if (!mAMPerDay[date.toISOString()]) {
        mAMPerDay[date.toISOString()] = {
          sum: incidence,
          count: 1,
          avg: incidence,
          avgColor: incidenceColor,
          min: incidence,
          minColor: incidenceColor,
          max: incidence,
          maxColor: incidenceColor,
        };
      } else {
        const temp: MAMDayEntry = JSON.parse(
          JSON.stringify(mAMPerDay[date.toISOString()])
        ); //independent copy!
        temp.sum += incidence;
        temp.count += 1;
        temp.avg = temp.sum / temp.count;
        temp.avgColor = getColorForValue(temp.avg, weekIncidenceColorRanges);
        if (incidence > temp.max) {
          temp.max = incidence;
          temp.maxColor = incidenceColor;
        }
        if (incidence < temp.min) {
          temp.min = incidence;
          temp.minColor = incidenceColor;
        }
        mAMPerDay[date.toISOString()] = temp;
      }
    }
  }
  for (const date of Object.keys(mAMPerDay)) {
    colorsPerDay[date].min = { color: mAMPerDay[date].minColor };
    colorsPerDay[date].avg = { color: mAMPerDay[date].avgColor };
    colorsPerDay[date].max = { color: mAMPerDay[date].maxColor };
  }
  const stop = new Date().getTime();
  const logtime = new Date().toISOString().substring(0, 18);
  console.log(
    `${logtime}: ${region} colorsPerDay creation time: ${(stop - start) / 1000} seconds`
  );
  return colorsPerDay;
}

export async function VideoResponse(
  region: Region,
  videoduration: number,
  days?: number
): Promise<{ filename: string }> {
  // get the actual meta data
  const metaData = await getMetaData();

  // set the reference date
  const refDate = getDateBeforeDate(metaData.version, 1);
  // the path to stored incidence per day files and status
  const incidenceDataPath = "./dayPics/";
  // path and filename for status.json
  const statusFileName = `${incidenceDataPath}status.json`;
  // path and filename for status lockfile
  const statusLockFile = `${incidenceDataPath}status.lockfile`;
  // init status
  let status: Status;

  // wait for unlocked status file
  if (fs.existsSync(statusLockFile)) {
    while (fs.existsSync(statusLockFile)) {
      function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      await delay(50); //wait 50 ms
    }
  }
  // if no status.json file exists write a initial one
  if (!fs.existsSync(statusFileName)) {
    const initialStatus: Status = {
      states: false,
      districts: false,
      videos: {
        districts: [],
        states: [],
      },
    };
    fs.writeFileSync(statusFileName, JSON.stringify(initialStatus));
  }

  //check if incidencesPerDay_date.json exists
  let colorsPerDay: ColorsPerDay = {};
  const jsonFileName = `${incidenceDataPath}${region}-incidenceColorsPerDay_${refDate}.json`;
  if (fs.existsSync(jsonFileName)) {
    colorsPerDay = JSON.parse(fs.readFileSync(jsonFileName).toString());
  } else {
    // if region incidence per day data file not exists requst the data
    colorsPerDay = await ColorsPerDay(metaData, region);
    // store to disc
    const jsonData = JSON.stringify(colorsPerDay);
    fs.writeFileSync(jsonFileName, jsonData);
    // new incidencesPerDay , change status
    // wait for ulocked status.json file
    if (fs.existsSync(statusLockFile)) {
      while (fs.existsSync(statusLockFile)) {
        function delay(ms: number) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }
        await delay(50); //wait 50 ms
      }
    }
    //set status lockfile
    fs.writeFileSync(statusLockFile, "");
    // read status
    status = JSON.parse(fs.readFileSync(statusFileName).toString());
    // change status
    status[region] = false;
    // write status to disc
    fs.writeFileSync(statusFileName, JSON.stringify(status));
    //unset status lockfile
    fs.rmSync(statusLockFile);
  }

  // get a sorted list of incidencePerDay keys
  const colorsPerDayKeys = Object.keys(colorsPerDay).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  // save days to oldDays
  let oldDays = days;

  // some checks for :days
  if (days != null) {
    if (isNaN(days)) {
      throw new TypeError(
        "Wrong format for ':days' parameter! This is not a number."
      );
    } else if (days > colorsPerDayKeys.length || days < 100) {
      throw new RangeError(
        `':days' parameter must be between '100' and '${colorsPerDayKeys.length}'`
      );
    }
  } else {
    days = colorsPerDayKeys.length;
  }
  const numberOfFrames = days;

  // some checks for :duration
  if (isNaN(videoduration)) {
    throw new TypeError(
      "Wrong format for ':duration' parameter! This is not a number."
    );
  } else if (
    Math.floor(numberOfFrames / videoduration) < 5 ||
    Math.floor(numberOfFrames / videoduration) > 25
  ) {
    throw new RangeError(
      `':duration' parameter must be between '${
        Math.floor(numberOfFrames / 25) + 1
      }' and '${Math.floor(numberOfFrames / 5)}' seconds if 'days:' is '${
        oldDays ? oldDays.toString() : "unlimited"
      }'`
    );
  }

  // calculate the frame rate
  // minimum frameRate = 5; maximum framrate = 25; max videoduration ~ 60 Seconds
  const frameRate =
    Math.floor(numberOfFrames / videoduration) < 5
      ? 5
      : Math.floor(numberOfFrames / videoduration) > 25
      ? 25
      : Math.floor(numberOfFrames / videoduration);

  // video file name that is requested
  const daysStr = days.toString().padStart(4, "0");
  const durationStr = videoduration.toString().padStart(4, "0");
  const nowTimeOnly = new Date().toISOString().split("T")[1];
  const created = new Date(`${refDate}T${nowTimeOnly}`).getTime();
  const mp4FileName = `./videos/${region}_${refDate}_Days${daysStr}_Duration${durationStr}.mp4`;
  // path where the differend frames are stored
  const dayPicsPath = `./dayPics/${region}/`;
  // check if requested video exist, if yes return the path
  if (fs.existsSync(mp4FileName)) {
    return { filename: mp4FileName };
  }

  // lockfilename
  const lockFile = `./dayPics/${region}.lockfile`;

  // check if the lockfile exist,
  // witch meens that the single frames (region) or one video (region) is calculating now by a other process
  // wait for the other prozess to finish check every 5 seconds
  if (fs.existsSync(lockFile)) {
    while (fs.existsSync(lockFile)) {
      function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      await delay(2500);
    }
    // maybe the other prozess calculates the same video return the name
    if (fs.existsSync(mp4FileName)) {
      return { filename: mp4FileName };
    }
  }

  // create lockfile and start prozessing single frames and/or mp4 file
  fs.writeFileSync(lockFile, "");

  // set basic full path for frames with legend and frames without legend
  const framesFullPath = `${dayPicsPath}/${region}_F-0000.png`;

  // calculate the new pictures only if no other prozess has done this. read the status file
  // no other region thread is running, because of region lockfile! locking status file is not nesessary!

  // read status
  status = JSON.parse(
    fs.readFileSync(`${incidenceDataPath}status.json`).toString()
  );

  if (!status[region]) {
    //load the region mapfile
    const mapData = region == Region.districts ? DistrictsMap : StatesMap;
    // find the last stored incidencePerDay file witch is the basis of the stored pict files
    let allRegionsColorsPerDayFiles = fs.readdirSync(incidenceDataPath);
    allRegionsColorsPerDayFiles = allRegionsColorsPerDayFiles
      .filter((file) => file.includes(`${region}-incidenceColorsPerDay_`))
      .sort((a, b) => (a > b ? -1 : 1));
    const oldRegionsColorsPerDayFile =
      allRegionsColorsPerDayFiles.length > 1
        ? `${incidenceDataPath}${allRegionsColorsPerDayFiles[1]}`
        : "dummy";
    // load the old incidences (if exists)
    let oldColorsPerDay: ColorsPerDay = {};
    if (fs.existsSync(oldRegionsColorsPerDayFile)) {
      oldColorsPerDay = JSON.parse(
        fs.readFileSync(oldRegionsColorsPerDayFile).toString()
      );
    }

    // function to compare two Objects
    function isDiffernd(obj1, obj2) {
      return JSON.stringify(obj1) !== JSON.stringify(obj2);
    }

    // find all days that changed one or more colors, and store this key to allDiffs
    let start = new Date().getTime();
    let allDiffs = [];
    let newFrames = 0;
    let changedFrames = 0;
    for (const date of colorsPerDayKeys) {
      // if datekey is not present in old incidences file always calculate this date, push key to allDiffs[]
      if (!oldColorsPerDay[date]) {
        allDiffs.push(date);
        newFrames += 1;
      } else {
        // else test every regionKey for changed colors,
        for (const rgnKy of Object.keys(colorsPerDay[date])) {
          if (
            isDiffernd(colorsPerDay[date][rgnKy], oldColorsPerDay[date][rgnKy])
          ) {
            // push datekey to allDiffs[] if one color is differend,
            allDiffs.push(date);
            changedFrames += 1;
            // and break this "for loop"
            break;
          }
        }
      }
    }
    let stop = new Date().getTime();
    let logtime = new Date().toISOString().substring(0, 18);
    console.log(
      `${logtime}: ${region}; new frames: ${newFrames}; changed frames: ${changedFrames}; calculation time: ${(stop - start) / 1000} seconds`
    );
    // if length allDiffs[] > 0
    // re-/calculate all new or changed days as promises
    if (allDiffs.length > 0) {
      let start = new Date().getTime();
      const firstPossibleDate = new Date(colorsPerDayKeys[0]).getTime();
      const promises = [];
      allDiffs.forEach((date) => {
        // calculate the frameNumber
        const frmNmbrStr = (
          (new Date(date).getTime() - firstPossibleDate) / 86400000 +
          1
        )
          .toString()
          .padStart(4, "0");
        // frameName
        const frameName = framesFullPath.replace("F-0000", `F-${frmNmbrStr}`);

        // add fill color to every region
        for (const regionPathElement of mapData.children) {
          const idAttribute = regionPathElement.attributes.id;
          const id = idAttribute.split("-")[1];
          regionPathElement.attributes["fill"] = colorsPerDay[date][id].color;
          if (region == Region.states) {
            regionPathElement.attributes["stroke"] = "#DBDBDB";
            regionPathElement.attributes["stroke-width"] = "0.9";
          }
        }
        const svgBuffer = Buffer.from(stringify(mapData));

        // define headline depending on region
        const hdline =
          region == Region.districts
            ? "7-Tage-Inzidenz der Landkreise"
            : "7-Tage-Inzidenz der Bundesländer";

        // define mAM
        let mAM: MAM[] = [
          { name: "min", iCol: colorsPerDay[date]["min"].color, nCol: "green" },
        ];
        mAM.push({
          name: "avg",
          iCol: colorsPerDay[date]["avg"].color,
          nCol: "orange",
        });
        mAM.push({
          name: "max",
          iCol: colorsPerDay[date]["max"].color,
          nCol: "red",
        });

        // define mAMG
        // get range index of min color
        const minRangeindex = weekIncidenceColorRanges.findIndex(
          (range) => range.color == colorsPerDay[date]["min"].color
        );
        // get range index of avg color
        const avgRangeindex = weekIncidenceColorRanges.findIndex(
          (range) => range.color == colorsPerDay[date]["avg"].color
        );
        //get range index of max color
        const maxRangeindex = weekIncidenceColorRanges.findIndex(
          (range) => range.color == colorsPerDay[date]["max"].color
        );
        let mAMG: MAMGrouped = {
          [colorsPerDay[date]["min"].color]: [
            { name: "min", nCol: "green", rInd: minRangeindex },
          ],
        };
        if (mAMG[colorsPerDay[date]["avg"].color]) {
          mAMG[colorsPerDay[date]["avg"].color].push({
            name: "avg",
            nCol: "orange",
            rInd: avgRangeindex,
          });
        } else {
          mAMG[colorsPerDay[date]["avg"].color] = [
            { name: "avg", nCol: "orange", rInd: avgRangeindex },
          ];
        }
        if (mAMG[colorsPerDay[date]["max"].color]) {
          mAMG[colorsPerDay[date]["max"].color].push({
            name: "max",
            nCol: "red",
            rInd: maxRangeindex,
          });
        } else {
          mAMG[colorsPerDay[date]["max"].color] = [
            { name: "max", nCol: "red", rInd: maxRangeindex },
          ];
        }

        // push new promise for frames with legend
        promises.push(
          sharp(
            getMapBackground(
              hdline,
              new Date(date),
              weekIncidenceColorRanges,
              mAM,
              mAMG
            )
          )
            .composite([{ input: svgBuffer, top: 100, left: 180 }])
            .png({ quality: 100 })
            .toFile(frameName)
        );
      });
      let stop = new Date().getTime();
      let logtime = new Date().toISOString().substring(0, 18);
      console.log(
        `${logtime}: ${region} frames promises creation time: ${(stop - start) / 1000} seconds`
      );
      // await all frames promises
      start = new Date().getTime();
      await Promise.all(promises);
      stop = new Date().getTime();
      logtime = new Date().toISOString().substring(0, 18);
      console.log(
        `${logtime}: ${region} frames promises execution time: ${(stop - start) / 1000} seconds`
      );
    }
    // wait for unlocked status.json
    if (fs.existsSync(statusLockFile)) {
      while (fs.existsSync(statusLockFile)) {
        function delay(ms: number) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }
        await delay(50); //wait 50 ms
      }
    }
    //set status lockfile
    fs.writeFileSync(statusLockFile, "");
    // read status
    status = JSON.parse(fs.readFileSync(statusFileName).toString());
    // set status for region to true (all frames are processed)
    status[region] = true;
    // write status to disc
    fs.writeFileSync(statusFileName, JSON.stringify(status));
    //unset status lockfile
    fs.rmSync(statusLockFile);
  }

  // set searchpath for frames
  const framesNameVideo = `${dayPicsPath}${region}_F-%04d.png`;

  // set first frame number for video as a four digit string if :days is set, otherwise it is 0001
  const firstFrameNumber = (colorsPerDayKeys.length - days + 1)
    .toString()
    .padStart(4, "0");

  // Tell fluent-ffmpeg where it can find FFmpeg
  ffmpeg.setFfmpegPath(ffmpegStatic);

  // calculate the requested video
  const start = new Date().getTime();
  const mp4out = await ffmpegSync(
    framesNameVideo,
    mp4FileName,
    frameRate.toString(),
    firstFrameNumber,
    lockFile
  );
  const stop = new Date().getTime();
  const logtime = new Date().toISOString().substring(0, 18);
  console.log(
    `${logtime}: ${region} video rendering time: ${(stop - start) / 1000} seconds.`
  );
  // wait for unlocked status.json
  if (fs.existsSync(statusLockFile)) {
    while (fs.existsSync(statusLockFile)) {
      function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }
      await delay(50); //wait 50 ms
    }
  }
  //set status lockfile
  fs.writeFileSync(statusLockFile, "");
  // read status
  status = JSON.parse(fs.readFileSync(statusFileName).toString());
  // push video data filename and crationtime to status
  status.videos[region].push({ filename: mp4FileName, created: created });
  // find region video files not from refData
  const oldVideoFiles = status.videos[region].filter(
    (video) => !video.filename.includes(refDate)
  );
  // clean region video files in status.videos[region]
  status.videos[region] = status.videos[region].filter((video) =>
    video.filename.includes(refDate)
  );
  // delete old region video files
  oldVideoFiles.forEach((video) => fs.rmSync(video.filename));
  // cleanup region videofiles, store only the 5 last created entrys, delete the oldest entry(s)
  status.videos[region].sort((a, b) => b.created - a.created);
  while (status.videos[region].length > 5) {
    const removed = status.videos[region].pop();
    fs.rmSync(removed.filename);
  }
  // write status to disc
  fs.writeFileSync(statusFileName, JSON.stringify(status));
  //unset status lockfile
  fs.rmSync(statusLockFile);

  // cleanup region incidences .json files
  let allJsonFiles = fs.readdirSync(incidenceDataPath);
  allJsonFiles = allJsonFiles.filter((file) =>
    file.includes(`${region}-incidence`)
  );
  // keep the last 2 files only
  if (allJsonFiles.length > 2) {
    allJsonFiles.sort((a, b) => (a > b ? -1 : 1));
    for (let index = 2; index < allJsonFiles.length; index++) {
      fs.rmSync(`${incidenceDataPath + allJsonFiles[index]}`);
    }
  }

  // all done, remove region lockfile
  fs.rmSync(lockFile);

  return mp4out;
}
