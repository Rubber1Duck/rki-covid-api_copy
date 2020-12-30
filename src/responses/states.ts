import { IResponseMeta, ResponseMeta } from './meta'
import { getLastStateCasesHistory, getLastStateDeathsHistory, getLastStateRecoveredHistory, getNewStateCases, getNewStateDeaths, getStatesData, IStateData, ResponseData } from '../requests';
import { getStateAbbreviationById, getStateIdByAbbreviation } from '../utils'

interface StateData extends IStateData {
    weekIncidence: number,
    casesPer100k: number,
    delta: {
        cases: number,
        deaths: number
    }
}

interface StatesData extends IResponseMeta {
    states: StateData[]
}

export async function StatesResponse(): Promise<StatesData> {

    const statesData = await getStatesData();
    const statesNewCasesData = await getNewStateCases();
    const statesNewDeathsData = await getNewStateDeaths();

    function getStateById (data: ResponseData<any[]>, id: number): any | null {
        for (const state of data.data) {
            if (state.id == id) return state;
        }
        return null
    }    

    const states = statesData.data.map((state) => {
        return {
            ...state,
            weekIncidence: state.casesPerWeek / state.population * 100000,
            casesPer100k: state.cases / state.population * 100000,
            delta: {
                cases: getStateById(statesNewCasesData, state.id)?.cases ?? 0,
                deaths: getStateById(statesNewDeathsData, state.id)?.deaths ?? 0
            }
        }
    })

    return {
        states,
        meta: new ResponseMeta(statesData.lastUpdate)
    }

}

interface StateHistory<T> {
    id: number,
    name: string,
    history: T[]
}
interface StatesHistoryData<T> extends IResponseMeta {
    data: T
}

interface StatesCasesHistory {
    [key: string]: StateHistory<{cases: number, date: Date}>
}
export async function StatesCasesHistoryResponse(days?: number, abbreviation?: string): Promise<StatesHistoryData<StatesCasesHistory>> {
    
    let id = null;
    if (abbreviation != null) {
        id = getStateIdByAbbreviation(abbreviation);
    }

    const statesHistoryData = await getLastStateCasesHistory(days, id);

    const data: StatesCasesHistory = {}

    for (const historyData of statesHistoryData.data) {
        const abbr = getStateAbbreviationById(historyData.id);
        if (data[abbr] == null) {
            data[abbr] = {
                id: historyData.id, 
                name: historyData.name,
                history: []
            }
        }
        data[abbr].history.push({
            cases: historyData.cases,
            date: new Date(historyData.date)
        })
    }
    return {
        data,
        meta: new ResponseMeta(statesHistoryData.lastUpdate)
    };
}

interface StatesDeathsHistory {
    [key: string]: StateHistory<{deaths: number, date: Date}>
}
export async function StatesDeathsHistoryResponse(days?: number, abbreviation?: string): Promise<StatesHistoryData<StatesDeathsHistory>> {
    
    let id = null;
    if (abbreviation != null) {
        id = getStateIdByAbbreviation(abbreviation);
    }

    const statesHistoryData = await getLastStateDeathsHistory(days, id);

    const data: StatesDeathsHistory = {}

    for (const historyData of statesHistoryData.data) {
        const abbr = getStateAbbreviationById(historyData.id);
        if (data[abbr] == null) {
            data[abbr] = {
                id: historyData.id, 
                name: historyData.name,
                history: []
            }
        }
        data[abbr].history.push({
            deaths: historyData.deaths,
            date: new Date(historyData.date)
        })
    }
    return {
        data,
        meta: new ResponseMeta(statesHistoryData.lastUpdate)
    };
}

interface StatesRecoveredHistory {
    [key: string]: StateHistory<{recovered: number, date: Date}>
}
export async function StatesRecoveredHistoryResponse(days?: number, abbreviation?: string): Promise<StatesHistoryData<StatesRecoveredHistory>> {
    
    let id = null;
    if (abbreviation != null) {
        id = getStateIdByAbbreviation(abbreviation);
    }

    const statesHistoryData = await getLastStateRecoveredHistory(days, id);

    const data: StatesRecoveredHistory = {}

    for (const historyData of statesHistoryData.data) {
        const abbr = getStateAbbreviationById(historyData.id);
        if (data[abbr] == null) {
            data[abbr] = {
                id: historyData.id, 
                name: historyData.name,
                history: []
            }
        }
        data[abbr].history.push({
            recovered: historyData.recovered,
            date: new Date(historyData.date)
        })
    }
    return {
        data,
        meta: new ResponseMeta(statesHistoryData.lastUpdate)
    };
}