

export type FuzzySubString = {
    matched_text: string, 
    start_position: number,
    end_position: number,
    has_gaps: boolean
};

export type TextTokens = string[];


export type PathPart = {needlePart:string, start_position: number, end_position: number, debug?: {distanceFromPrevious: number, textBetweenPrevious:string}};
export type Path = {
    parts: PathPart[],
    invalid?: boolean,
    has_missing_needle_parts: boolean,
    has_gaps: boolean,
    cumulative_distance_between_parts:number,
    final: FuzzySubString
}
