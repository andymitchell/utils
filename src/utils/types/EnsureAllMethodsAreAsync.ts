import {EventEmitter} from "events";
import { TypedCancelableEventEmitter } from "../typedCancelableEventEmitter";

export type EnsureAllMethodsAreAsyncExcludedDefault = EventEmitter | TypedCancelableEventEmitter<any>;

export type EnsureAllMethodsAreAsync<T, ExcludeTypes = EnsureAllMethodsAreAsyncExcludedDefault> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? (T[K] extends (...args: any[]) => Promise<any> ? T[K] : never)
        : T[K] extends ExcludeTypes
        ? T[K]
        : T[K];
};

export type EnsureAllMethodsAreAsyncRecursive<T, ExcludeTypes = EnsureAllMethodsAreAsyncExcludedDefault> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any
        ? (T[K] extends (...args: any[]) => Promise<any> ? T[K] : never)
        : T[K] extends ExcludeTypes
        ? T[K]
        : T[K] extends object
        ? EnsureAllMethodsAreAsyncRecursive<T[K], ExcludeTypes>
        : T[K];
};


// EXAMPLES

/*
type PersonLocation = {
    get: () => string
}
type Person = {
    location: PersonLocation,
    name: () => string
}

type PersonLocationAsync = {
    get: () => Promise<string>
}
type PersonAsync = {
    location: PersonLocationAsync,
    name: () => Promise<string>
}

type PersonAsyncWithEmitterThatIsNotAsync = {
    location: PersonLocationAsync,
    emitter: TypedCancelableEventEmitter<any>
    name: () => Promise<string>
}

const p1ExpectFail:EnsureAllMethodsAreAsyncRecursive<Person> = {
    name: () => 'Bob',
    location: {
        get: () => 'Earth'
    }
}

const p2ExpectSuccess:EnsureAllMethodsAreAsyncRecursive<PersonAsync> = {
    name: async () => 'Bob',
    location: {
        get: async () => 'Earth'
    }
}


const p3ExpectSuccess:EnsureAllMethodsAreAsyncRecursive<PersonAsyncWithEmitterThatIsNotAsync> = {
    name: async () => 'Bob',
    emitter: new TypedCancelableEventEmitter<any>(),
    location: {
        get: async () => 'Earth'
    }
}

const p4ExpectFail:EnsureAllMethodsAreAsyncRecursive<PersonAsyncWithEmitterThatIsNotAsync, never> = {
    name: async () => 'Bob',
    emitter: new TypedCancelableEventEmitter<any>(),
    location: {
        get: async () => 'Earth'
    }
}
*/