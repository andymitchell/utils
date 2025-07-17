

export type FuzzySubString = {
    matchedText: string, 
    startPosition: number,
    endPosition: number,
    hasGaps: boolean
};

export type TextTokens = string[];


export type PathPart = {needlePart:string, startPosition: number, endPosition: number, debug?: {distanceFromPrevious: number, textBetweenPrevious:string}};
export type Path = {
    parts: PathPart[],
    invalid?: boolean,
    hasMissingNeedleParts: boolean,
    hasGaps: boolean,
    cumulativeDistanceBetweenParts:number,
    final: FuzzySubString
}
