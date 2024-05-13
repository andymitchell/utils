type Sha256HexOutput = {
    itemToHash: { [item: string]: string };
    hashes: Array<string>
}



export function getCrypto() {
    if (typeof window !== 'undefined' && window.crypto) {
        // We're in a browser environment
        return window.crypto;
    } else if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        // We're in a Node.js environment
        return require('crypto').webcrypto;
        //const crypto = await import('crypto');
        //return crypto.webcrypto;
    } else {
        throw new Error('Crypto not available');
    }
}

export async function sha256HexArrayToObject(items: Array<string>): Promise<Sha256HexOutput> {
    const output:Sha256HexOutput = {
        itemToHash: {},
        hashes: []
    };
    for( const item of items ) {
        const hash = await sha256Hex(item);
        output.hashes.push( hash );
        output.itemToHash[item] = hash; 
    }
    return output;
}

export async function sha256Hex(str:string): Promise<string> {
    
    const crypto = await getCrypto();
        const msgUint8 = new TextEncoder().encode(str);                               // encode as (utf-8) Uint8Array
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    
}

export async function sha256raw(plain:string): Promise<string> {
    
    const crypto = await getCrypto();
        const encoder = new TextEncoder();
        const data = encoder.encode(plain);
        const sha256inBuffer: ArrayBuffer = await crypto.subtle.digest('SHA-256', data);
        // @ts-ignore
        return String.fromCharCode.apply(null, new Uint8Array(sha256inBuffer));
    
}

export async function sha1Hex(str:string): Promise<string> {
    // BEWARE: Know that sha1 is NOT cryptographically safe (collisions possible). 
    //  Only permitted as a convenience hash that uses less space 
    
    const crypto = await getCrypto();
        const msgUint8 = new TextEncoder().encode(str);                               // encode as (utf-8) Uint8Array
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);             // hash the message
        const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    
}



export function generateRandomString(length = 28) {
    var array = new Uint32Array(Math.round(length / 2) + 2);
    crypto.getRandomValues(array);
    let str = Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
    return str.substr(0, length);
}

export async function pkceS256ChallengeFromVerifier(v:string) {
    const hashed = await sha256raw(v);
    return base64urlencode(hashed);
}

export function base64urlencode(str:string) {
    // btoa accepts chars only within ascii 0-255 and base64 encodes them.
    // Then convert the base64 encoded to base64url encoded
    //   (replace + with -, replace / with _, trim trailing =)
    return btoa(str)
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urldecode(str:string) {
    // atob doesn't appear to need any padding with suffixed =, which most Base64 libraries require.
    // Unsure how well this handles edge-case encodings, but works well for JWT ID Tokens. Might need something more robust for others.
    return atob(base64urlUnescape(str));
};
export function base64urlUnescape(str:string) {
    return str.replace(/\-/g, '+').replace(/_/g, '/');
}

export function jwtDecode(token:string) {

    const segments = token.split('.');
    const headerSegment = segments[0];
    const payloadSegment = segments[1];
    if (!headerSegment || !payloadSegment) throw new Error('Not enough or too many segments');

    // base64 decode and parse JSON
    
    const header = JSON.parse(base64urldecode(headerSegment));
    const payload = JSON.parse(base64urldecode(payloadSegment));
    const signature = segments[2];

    return {
        header: header,
        payload: payload,
        signature: signature
    }

}


// One Time Pad / Vernom Cipher - XOR bits
export function vernomHash(string:string, key:string) {
    if (string.length !== key.length) throw new Error("EncryptionFailure: One time pad needs string and key to be the same length.");
    let ASCII;
    let vernomChar;
    let output = '';

    for (let i = 0; i < string.length; i++) {
        ASCII = (string.charCodeAt(i) ^ key.charCodeAt(i));
        vernomChar = String.fromCharCode(ASCII);
        output += vernomChar;
    }
    return output
}
export function vernomEncrypt(source:string, key:string) {
    return vernomHash(source, key);
}
export function vernomDecrypt(encrypted:string, key:string) {
    return vernomHash(encrypted, key);
}
