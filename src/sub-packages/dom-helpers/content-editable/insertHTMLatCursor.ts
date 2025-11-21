// With thanks to InboxSDK https://github.com/InboxSDK/InboxSDK/blob/d4f3e466da54c4c2e7021613959d15712e37e506/src/platform-implementation-js/lib/dom/insert-html-at-cursor.ts#L5
// This wasn't imported, because a) we just need this file, b) we wanted no deps on kefir 

/**
 * Inserts HTML (or a node) at the current cursor position within an element.
 *
 * - **Textareas**: inserts a plain string into the value at the caret (or replaces selection).
 * - **ContentEditable / HTML elements**: inserts HTML or an `HTMLElement` at the active DOM `Selection`.
 * - Preserves/updates the caret after insertion and returns the first inserted element (if any).
 *
 * Robust for tests:
 * - In headless/JSDom-like environments, it attempts to create/repair a selection in the target element.
 *
 * @param element - The target element: a `HTMLTextAreaElement` or a contenteditable/HTML container.
 * @param html - The HTML string to insert, or a DOM node (`HTMLElement`) to insert directly.
 * @returns The first inserted child element (if applicable), `null` if none, or `undefined` when no insertion occurred.
 *
 * @throws If a `HTMLElement` is passed when inserting into a `HTMLTextAreaElement`.
 * @throws If an active selection exists but is **outside** the target element.
 *
 * @example
 * // Insert plain text into a <textarea>
 * const ta = document.querySelector('textarea')!;
 * ta.focus();
 * ta.selectionStart = ta.selectionEnd = ta.value.length;
 * insertHTMLatCursor(ta, " — appended");
 *
 * @example
 * // Insert a snippet into a contenteditable div at the caret
 * const ed = document.querySelector('[contenteditable="true"]')!;
 * ed.focus();
 * document.getSelection()?.collapse(ed, ed.childNodes.length);
 * insertHTMLatCursor(ed, '<strong>Hello</strong>');
 */
export default function insertHTMLatCursor(
    element: HTMLElement,
    html: string | HTMLElement
): HTMLElement | null | undefined {
    return _insertHTMLatCursor(element, html);
}

export function _insertHTMLatCursor(
    element: HTMLElement,
    html: string | HTMLElement,
    assistTesting = true
): HTMLElement | null | undefined {
    // Validate the target element before proceeding
    if (!(element instanceof HTMLTextAreaElement) && !isContentEditable(element)) {
        throw new Error("Target element must be a HTMLTextAreaElement or have the contentEditable property set to true.");
    }

    element.focus();

    if (element instanceof HTMLTextAreaElement) {
        if (html instanceof HTMLElement) {
            throw new Error("html must be string");
        }
        let oldStart = element.selectionStart;

        // first delete selected range
        if (element.selectionStart < element.selectionEnd) {
            element.value =
                element.value.substring(0, element.selectionStart) +
                element.value.substring(element.selectionEnd);
        }

        // insert into position
        element.value =
            element.value.substring(0, oldStart) +
            html +
            element.value.substring(oldStart);
        // set caret
        element.selectionStart = oldStart + html.length;
        element.selectionEnd = oldStart + html.length;
    } else {
        let ownerDocument:Document | null = null;

        if ((element as any).getSelection) {
            ownerDocument = element as unknown as Document;
        } else if (
            element.ownerDocument &&
            (element.ownerDocument.getSelection as any)
        ) {
            ownerDocument = element.ownerDocument;
        }

        if (ownerDocument) {
            const sel = ownerDocument.getSelection();
            if( !sel ) throw new Error("Could not find a selection object");

            const range = getRangeForCursorInElement(element, sel, assistTesting);

            if( range ) {

                range.deleteContents();
                let frag;

                if (html instanceof DocumentFragment) {
                    frag = html;
                } else {
                    frag = document.createDocumentFragment();

                    if (html instanceof HTMLElement) {
                        frag.appendChild(html);
                    } else {
                        let el = document.createElement('div');
                        el.innerHTML = html;
                        let node;

                        while ((node = el.firstChild)) {
                            frag.appendChild(node);
                        }
                    }
                }


                let firstChild: HTMLElement = (frag as any).firstElementChild;
                range.insertNode(frag);

                
                // Simulate a mousedown event to stop pre-existing focus handlers
                let event = document.createEvent('MouseEvents');
                (event as any).initMouseEvent(
                    'mousedown',
                    false,
                    true,
                    undefined, // window,
                    1,
                    0,
                    0,
                    0,
                    0,
                    false,
                    false,
                    false,
                    false,
                    0,
                    null
                );
                event.preventDefault();
                element.dispatchEvent(event);
                // Preserve the cursor position
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                
                return firstChild;
            }
        }
    }
}

/**
 * Gets a `Range` representing the current caret/selection **within** the given element.
 * In test environments (e.g. JSDom), it will create/fix a selection inside `editableDiv` if missing.
 *
 * @param editableDiv - The element that should contain the selection.
 * @param selection - The active `Selection` object (usually from `document.getSelection()`).
 * @returns A `Range` anchored inside `editableDiv`, if one can be established.
 *
 * @throws If the active selection’s range is not inside `editableDiv` (and can’t be corrected).
 */
function getRangeForCursorInElement(editableDiv:HTMLElement, selection: Selection, assistTesting = true):Range | undefined {
    if( (selection.rangeCount===0) ) {
        // This indicates there's no cursor set anywhere, so force it.
        focusContentEditable(editableDiv);
    }

    let range:Range | undefined;
    
    // Test the selected range is inside the given element 
    range = selection.getRangeAt(0);
    if( !editableDiv.contains(range.commonAncestorContainer) && assistTesting && isTesting() ) {
        // This can happen in testing as things like JSDom might not update on the initial element.focus() to select the correct input box - so force it
        focusContentEditable(editableDiv);
    }
    range = selection.getRangeAt(0);
    if( !editableDiv.contains(range.commonAncestorContainer) ) {
        throw new Error("Selection/cursor is not inside the given element")
    }

    return range;
}

/**
 * Ensures the given contenteditable element is focused and has a collapsed caret
 * at the start (position 0). Used to initialize a selection in test/headless environments.
 *
 * @param editableDiv - The contenteditable element to focus and seed with a caret.
 */
function focusContentEditable(editableDiv:HTMLElement):void {
    // Focus on the div to make it active
    editableDiv.focus();

    // Get the browser's selection object
    const selection = window.getSelection();

    // Create a new range
    const range = document.createRange();

    // Set the range to the very beginning of the editable div
    range.setStart(editableDiv, 0);

    // Collapse the range to a single point (the cursor)
    range.collapse(true);

    // Remove any existing selections
    if (selection) {
        selection.removeAllRanges();

        // Add the new range to the selection
        selection.addRange(range);
    }
}

function isTesting():boolean { 
    
    try {
        if( typeof navigator!=='undefined' && navigator.userAgent.includes('jsdom') ) return true;
    } finally {}
    try {
        if( typeof process!=='undefined' && process?.env?.NODE_ENV==='test' ) return true;
    } finally {}

    return false;
}

function isContentEditable(element:HTMLElement):boolean {
    return element.isContentEditable || element.contentEditable==="true" || element.contentEditable==="plaintext-only";
}