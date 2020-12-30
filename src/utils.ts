export function getStateAbbreviationById(id: number): string | null {
    switch (id) {
        case 1:
            return "SH";
        case 2:
            return "HH";
        case 3:
            return "NI";
        case 4:
            return "HB";
        case 5:
            return "NW";
        case 6:
            return "HE";
        case 7:
            return "RP";
        case 8:
            return "BW";
        case 9:
            return "BY";
        case 10:
            return "SL";
        case 11:
            return "BE";
        case 12:
            return "BB";
        case 13:
            return "MV";
        case 14:
            return "SN";
        case 15:
            return "ST";
        case 16:
            return "TH";
        default:
            return null;
    }
}

export function getStateIdByAbbreviation(abbreviation: string): number | null {
    switch (abbreviation) {
        case "SH":
            return 1;
        case "HH":
            return 2;
        case "NI":
            return 3;
        case "HB":
            return 4;
        case "NW":
            return 5;
        case "HE":
            return 6;
        case "RP":
            return 7;
        case "BW":
            return 8;
        case "BY":
            return 9;
        case "SL":
            return 10;
        case "BE":
            return 11;
        case "BB":
            return 12;
        case "MV":
            return 13;
        case "SN":
            return 14;
        case "ST":
            return 15;
        case "TH":
            return 16;
        default:
            return null;
    }
}