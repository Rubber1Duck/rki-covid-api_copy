# VideoMaps

The following links return mp4 videos of the course of the pandemic.
At this time (2023-10-12) for each "category" (districts, states) 1374 single frames must be calculated initialy. This will be done for every category at the first time someone requests this category.
This initial run takes for states frames approx. 80 seconds and for districts frames approx. 150 seconds on a server with a 4 core Intel(R) Core(TM) i5-7600 @ 3.50Ghz processor. In both cases approx. 15 secondes are needed to render the default video (/video/states and /video/districts, all frames since 2020-01-07 and viedeo length ~ 60 seconds) on this hardware.
If you are running this api at home on not so performant hardware you have to expect significantly longer times. On my raspberryPi4 (4 cores 1.5 Ghz, 4GB RAM) this will take for states frames approx. 14 !! minutes and for districts frames approx. 35 !!! minutes! Rendering the video takes approx. 90 seconds for states and 120 seconds for districts.
After that initial run on next day only the frames that have changed colors are recalculated (maybe the week incidence is changed but the rangecolor not!). This changes are typicaly 2 - 20 frames for districts and 2 - 4 for states. This takes only a few seconds and is depend on the number of changed days (the minimum for each category is 1, because of the new day).
If all frames are calculated for the day the rendering of the video (if not requested on this day bevor) takes approx. 15 Seconds on a server with a 4 core Intel(R) Core(TM) i5-7600 @ 3.50Ghz processor and approx. 1.5 minutes on my raspberryPi 4 with 4GB RAM.
The last 5 requested videos are saved for each "category", and if re-requested are delivered imidiatly.

## `/video`

Redirects to `/video/districts`.

## `/video/districts`

Returns a Heatmap Video (MP4) of week incidences for districts with ~ 60 secondes length.

### Request

`GET https://api.corona-zahlen.org/video/districts`
[Open](/video/districts)

## `/video/:duration/districts`

Returns a Heatmap Video (MP4) of week incidences for districts with ~ :duration secondes length. There are some checks to hold the framerate between 5 and 25 fps. You will get an error message with the allowed range for all frames. default is 60 seconds.

### Request

`GET https://api.corona-zahlen.org/video/120/districts`
[Open](/video/120/districts)

## `/video/districts/:days`

Returns a Heatmap Video (MP4) of week incidences for districts, from the past :days days. lower :days as 100 is not allowed.

### Request

`GET https://api.corona-zahlen.org/video/districts/365`
[Open](/video/districts/365)

## `/video/:duration/districts/:days`

Returns a Heatmap Video (MP4) of week incidences for districts, from the past :days days and :duration seconds length. lower :days as 100 is not allowed. To hold the framerate between 5 and 25 fps some checks are done and you will recive a error message with the allowed range for this :days. Default is 60 Seconds but minumum 5 fps!

### Request

`GET https://api.corona-zahlen.org/video/120/districts/600`
[Open](/video/120/districts/600)

All endpoints mentioned above also apply to states e.g. /video/states, /video/states/:days, /video/:duration/states and /video/:duration/states/:days