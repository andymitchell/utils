

//document.body.setAttribute('data-formz_debug_enterreplacement', '1');
const isDebugging = () => true || !!document.body.dataset['formz_debug_enterreplacement'];

type KeySignature = {key: string, shiftKey?:boolean, ctrlKey?: boolean, metaKey?: boolean};
export class KeyRemapping {

    private unregisters: Function[];

    constructor(contenteditable:HTMLElement, keys: KeySignature[], action: 'shift-enter' | 'insert-br' | Function, cursorInsideQuerySelector?: string) {
        this.unregisters = [];

        

        const handler = (event:KeyboardEvent) => {
            

            // Is the content editable the active element? 
            if( document.activeElement===contenteditable ) {
                // Was key pressed 
                if( matchKeySignature(event, keys) ) {
                    const debug = isDebugging();
                    if( debug ) console.log("#KeyRemapping Signature pressed", {contenteditable, activeElement: document.activeElement, event});

                    let proceed = false;
                    // Is the cursor inside a node we care about
                    if( cursorInsideQuerySelector ) {
                        const element = getNodeAtCursor();
                        const insideElement = element && element.closest(cursorInsideQuerySelector);
                        if( debug ) console.log("#KeyRemapping testing inside element", {contenteditable, cursorInsideQuerySelector, element, insideElement});
                        if( insideElement && contenteditable.contains(insideElement) ) {
                            proceed = true;
                        }
                    } else {
                        proceed = true;
                    }

                    if( proceed ) {
                        if( debug ) console.log("#KeyRemapping proceed OK: ", action);
                        event.stopPropagation();
                        event.preventDefault();

                        if( action==='shift-enter' ) {
                            simulateShiftEnter(contenteditable, event);
                        } else if( action==='insert-br' ) { 
                            const selection = window.getSelection();
                            if( selection ) {
                                insertLineBreakAtRange(selection.getRangeAt(0));
                            } else {
                                if( debug ) debugger;
                            }
                        } else if( typeof action==='function' ) {
                            action();
                        }
                    }
                
                }
            }
        }

        document.addEventListener('keydown', handler, true);
        this.unregisters.push(() => document.removeEventListener('keydown', handler, true))
    }

    dispose() {
        this.unregisters.forEach(x => x());
    }


}

function getNodeAtCursor() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        return node.nodeType===1? node as HTMLElement : node.parentElement;
    }
}

function matchKeySignature(event:KeyboardEvent, keys:KeySignature[]) {
    return keys.some(key=> {
        return key.key===event.key && 
        (key.shiftKey===undefined || key.shiftKey===event.shiftKey) &&
        (key.ctrlKey===undefined || key.ctrlKey===event.ctrlKey) &&
        (key.metaKey===undefined || key.metaKey===event.metaKey);
    })
}

function simulateShiftEnter(targetElement:HTMLElement, originalEvent: KeyboardEvent): void {
    // FYI Will not work in Gmail because the event is marked isTrusted=false, and Google ignores that. 

    // Create a new event
    const event = new KeyboardEvent('keydown', {
        ...originalEvent,
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        shiftKey: true, // Indicates the Shift key is pressed
        bubbles: true, // Event bubbles up through the DOM
        cancelable: true, // Event can be canceled
    });

    // Dispatch the event on the target element
    targetElement.dispatchEvent(event);
}

function insertLineBreakAtRange(range: Range): void {
    const br = document.createElement('br');
    range.insertNode(br);

    // Move the cursor after the <br>
    const newRange = document.createRange();
    newRange.setStartAfter(br);
    newRange.setEndAfter(br);
    const selection = window.getSelection();
    if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
    }
}
