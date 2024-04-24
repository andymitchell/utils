type Styles = Record<string, string>;
export function applyInheritedStyles(element:HTMLElement, root = document.body, resetStyleKeys?: string[]) {
    const styles = getInheritedStyles(element, root);

    // Apply the styles to the element
    for (let key in styles) {
        (element as any).style[key] = styles[key];
    }

    // Reset any style keys that haven't been overwritten by 'styles'
    if( Array.isArray(resetStyleKeys) ) {
        const applyResetStyleKeys = resetStyleKeys.map(key => key.toLowerCase()).filter(key => !styles[key] && RESET_STYLE_KEYS[key]);
        applyResetStyleKeys.forEach(key => {
            (element as any).style[key] = RESET_STYLE_KEYS[key];
        })
    }
}

export function getInheritedStyles(element:HTMLElement, root = document.body):Styles {
    let current:HTMLElement = element;

    const styles:Styles = {};
    const setStyle = (key:string, value:string) => {
        // Only add if it's not already set (to respect closer ancestors, as we work up tree)
        if (!styles.hasOwnProperty(key)) {
            styles[key] = value;
        }
    }

    // Function to merge styles
    const mergeStyles = (styleObj:CSSStyleDeclaration) => {
        for (let i = 0; i < styleObj.length; i++) {
            const key = styleObj[i];
            if( key ) {
                setStyle(key, styleObj.getPropertyValue(key));
            }
        }
    };

    const mergeTagStyle = (element:HTMLElement) => {
        const tagStyle = TAGNAME_STYLES[element.tagName];
        if( tagStyle ) {
            setStyle(tagStyle.key, tagStyle.value);
        }
    }

    // Traverse up the tree and merge styles
    while (current && current !== root) {
        mergeTagStyle(current);
        mergeStyles(current.style);
        if( !current.parentElement ) break;
        current = current.parentElement;
    }

    return styles;

}

type TagStyle = {key: string, value: string};
const TAGNAME_STYLES:Record<string, TagStyle> = {
    'B': {key: 'font-weight', value: 'bold'},
    'STRONG': {key: 'font-weight', value: 'bold'},
    'I': {key: 'font-style', value: 'italic'},
    'EM': {key: 'font-style', value: 'italic'},
    'U': {key: 'text-decoration', value: 'underline'},
}

const RESET_STYLE_KEYS:Record<string, string> = {
    'font-weight': 'normal',
    'text-decoration': 'none',
    'color': 'initial',
    'background-color': 'initial'
}