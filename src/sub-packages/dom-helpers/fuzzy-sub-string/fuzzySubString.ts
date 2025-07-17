import type { FuzzySubString, Path, PathPart, TextTokens } from "./types.ts";

/**
 * 
 * Search a hay stack for a needle
 *  The needle is split into parts, to allow variations. 
 *  Examples: 
 *      In compose, Rangy highlights a phrase across multiple nodes (e.g. <div>Hello <a>world</a></div> => highlight 'llo worl' => <div>He<span highlight>llo </span><a><span highlight>worl</span>d</a>) The user might have then typed text between those nodes. We want to know the final form of the what they were trying to highlight, including bits between the <span highlight> nodes. So, it would extract the entire compose body, then an array of the text in <span highlight>, and join them up.
 *      Alternatively, the user might copy a bit of text in an email, and expect the app to match it to the HTML form of the email. It would be most robust to break the copied text into word tokens (needle parts), then make the HTML the haystack.  
 *  Technique:
 *      Take the first needle part, and see how many times it appears in the haystack - make a start point of each appearance
 *      For each starter path, then find the next needle part after it (and the gap between)
 *      Choose the path with the shortest gaps between needle parts. 
 * 
 * @param haystack 
 * @param needleParts 
 */
export function fuzzySubString(haystack:string, needleParts:TextTokens, allowMissingNeedleParts?:boolean):FuzzySubString | undefined {
    
    
    const needlePartsNonEmpty = needleParts.filter(x => !!x);
    if( needlePartsNonEmpty.length===0 ) return undefined;

    // Take the first needle part, and start a new process for every occurence
    let firstNeedlePart = needlePartsNonEmpty.shift();
    if( allowMissingNeedleParts ) {
        // Keep going until we find the first present token 
        while( !firstNeedlePart && needlePartsNonEmpty.length>0 ) firstNeedlePart = needlePartsNonEmpty.shift();
    }
    if( !firstNeedlePart ) return undefined;

    const paths:Path[] = [];
    let start_position = 0;
    while(true) {
        start_position = haystack.indexOf(firstNeedlePart, start_position);
        if( start_position===-1 ) break;
        const end_position = start_position + firstNeedlePart.length;
        paths.push({
            parts: [{needlePart: firstNeedlePart, start_position, end_position}],
            final: {
                matched_text: firstNeedlePart,
                start_position,
                end_position,
                has_gaps: false
            },
            has_missing_needle_parts: false,
            has_gaps: false,
            cumulative_distance_between_parts: 0
        })
        start_position = end_position;
    }

    // Do the remainder of the needle parts
    for( const needlePart of needlePartsNonEmpty ) {
        for( const path of paths ) {
            if( !path.invalid ) {
                const previousPart = path.parts[path.parts.length-1];
                if( !previousPart ) throw new Error("No op. At least one part should already exist after firstNeedlePart processed");
                const start_position = haystack.indexOf(needlePart, previousPart.end_position);
                if( start_position===-1 ) {
                    if( allowMissingNeedleParts ) {
                        path.has_missing_needle_parts = true;
                    } else {
                        path.invalid = true;
                    }
                } else {
                    const end_position = start_position+needlePart.length;
                    const part:PathPart = {needlePart, start_position, end_position};
                    path.parts.push(part);

                    const distanceFromPrevious = start_position-previousPart.end_position;
                    path.cumulative_distance_between_parts += distanceFromPrevious;

                    const textBetweenPrevious = haystack.substring(previousPart.end_position, start_position);
                    path.final.matched_text += textBetweenPrevious;
                    path.final.matched_text += needlePart;

                    part.debug = {textBetweenPrevious, distanceFromPrevious};

                    path.has_gaps = distanceFromPrevious>0;
                    path.final.end_position = end_position;
                }
            }
            
        }
    }

    // Find the path that's got the shortest number of gaps
    let pathWithShortestCumulativeDistanceBetweenParts:Path | undefined;
    for( const path of paths ) {
        if( !path.invalid && (!pathWithShortestCumulativeDistanceBetweenParts || path.cumulative_distance_between_parts<pathWithShortestCumulativeDistanceBetweenParts.cumulative_distance_between_parts) ) {
            pathWithShortestCumulativeDistanceBetweenParts = path;
        }
    }
    
    if( pathWithShortestCumulativeDistanceBetweenParts ) {
        pathWithShortestCumulativeDistanceBetweenParts.final.has_gaps = pathWithShortestCumulativeDistanceBetweenParts.has_gaps;
    }
    return pathWithShortestCumulativeDistanceBetweenParts?.final;
}




