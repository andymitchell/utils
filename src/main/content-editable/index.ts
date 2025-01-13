import { KeyRemapping } from "./KeyRemapping.ts";
import { applyInheritedStyles, getInheritedStyles } from "./applyInheritedStyles.ts";
import { getCursorPosition, setCursorPosition } from "./cursorPosition.ts";
import insertHTMLatCursor from "./insertHTMLatCursor.ts";

export const ContentEditable = {
    applyInheritedStyles,
    getInheritedStyles,
    getCursorPosition,
    setCursorPosition,
    insertHTMLatCursor,
    KeyRemapping
}