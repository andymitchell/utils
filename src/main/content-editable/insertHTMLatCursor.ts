// With thanks to InboxSDK https://github.com/InboxSDK/InboxSDK/blob/d4f3e466da54c4c2e7021613959d15712e37e506/src/platform-implementation-js/lib/dom/insert-html-at-cursor.ts#L5
// This wasn't imported, because a) we just need this file, b) we wanted no deps on kefir 

export default function insertHTMLatCursor(
    element: HTMLElement,
    html: string | HTMLElement
): HTMLElement | null | undefined {
    element.focus();

    if (element instanceof HTMLTextAreaElement) {
        if (html instanceof HTMLElement) {
            throw new Error("html must be string");
        }
        var oldStart = element.selectionStart;

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
        var editable = null;

        if ((element as any).getSelection) {
            editable = element;
        } else if (
            element.ownerDocument &&
            (element.ownerDocument.getSelection as any)
        ) {
            editable = element.ownerDocument;
        }

        if (editable) {
            var sel = (editable as any).getSelection();

            if (sel.getRangeAt && sel.rangeCount) {
                var range = sel.getRangeAt(0);
                range.deleteContents();
                var frag;

                if (html instanceof DocumentFragment) {
                    frag = html;
                } else {
                    frag = document.createDocumentFragment();

                    if (html instanceof HTMLElement) {
                        frag.appendChild(html);
                    } else {
                        var el = document.createElement('div');
                        el.innerHTML = html;
                        var node;

                        while ((node = el.firstChild)) {
                            frag.appendChild(node);
                        }
                    }
                }


                var firstChild: HTMLElement = (frag as any).firstElementChild;
                range.insertNode(frag);

                
                // Simulate a mousedown event to stop pre-existing focus handlers
                var event = document.createEvent('MouseEvents');
                (event as any).initMouseEvent(
                    'mousedown',
                    false,
                    true,
                    window,
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