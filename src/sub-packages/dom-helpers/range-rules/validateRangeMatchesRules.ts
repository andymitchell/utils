import type { RangeRules, ValidatedRangeRules } from "./types.ts";

export function validateRangeMatchesRules(range:Range, rules: RangeRules):ValidatedRangeRules {
    let broken:keyof RangeRules | undefined;

    // Get the common ancestor
    let commonAncestor = getCommonAncestorElement(range);
    
    if( commonAncestor ) {
        // Check each element under the ancestors 
        const elements = Array.from(commonAncestor.getElementsByTagName("*"));
        for( const element of elements ) {
            // Intersection rules: check the node is only partially contained in the range (if it's totally contained, it's fine)
            if( isPartiallyIntersecting(range, element) ) {
                if( rules.denyIntersectAnchors && element.tagName==='A' ) {
                    broken = 'denyIntersectAnchors';
                    break;
                }
                if( rules.denyIntersectAnyBlock ) {
                    if( !isInline(element) ) {
                        broken = 'denyIntersectAnyBlock';
                        break;
                    }
                }
            }
        }
    } else {
        throw new Error("Range had no common ancestor to read.");
    }
    
    return broken? {
        ok: false,
        broken
    } : {ok: true}
}

function isPartiallyIntersecting(range:Range, element:Element):boolean {
    // return !selection.containsNode(element, false) && selection.containsNode(element, true)
    return range.intersectsNode(element) && !isElementFullyContainedInRange(element, range);
}

function isElementFullyContainedInRange(element:Element, range:Range) {
    // FYI If you have the Selection, you can just use selection.containsNode 

    // Create a new range that spans the element
    const elementRange = document.createRange();
    elementRange.selectNodeContents(element);

    // Compare start points and end points
    const startCompare = range.compareBoundaryPoints(Range.START_TO_START, elementRange);
    const endCompare = range.compareBoundaryPoints(Range.END_TO_END, elementRange);

    // If the start of the range is before or at the start of the element
    // and the end of the range is at or after the end of the element,
    // then the element is fully contained in the range.
    return startCompare <= 0 && endCompare >= 0;
}

function getCommonAncestorElement(range:Range):HTMLElement | null {
    // Ensure we're working with an element node
    if (range.commonAncestorContainer.nodeType === 1) {
        return range.commonAncestorContainer as HTMLElement;
    } else {
        return range.commonAncestorContainer.parentElement;
    }
}

function isInline(element:Element):boolean {
    const naturallyInlineElements = ['span', 'a', 'label', 'em', 'strong', 'img', 'input', 'button'];
    const style = window.getComputedStyle(element);
    return naturallyInlineElements.includes(element.tagName.toLowerCase()) || style.display === 'inline' || style.display === 'inline-block';
}