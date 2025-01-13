export default function preventCompletionFactory() {
    const state:{delayMs?:number | undefined} = {};
    return {
        getDelayMs: () => state.delayMs,
        preventCompletion: (delayMs:number) => {
            state.delayMs = delayMs;
        }
    }
}