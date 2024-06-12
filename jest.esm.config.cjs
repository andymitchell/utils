module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {},
    extensionsToTreatAsEsm: ['.ts', '.tsx'],  // Treat these extensions as ESM
    globals: {
        'ts-jest': {
            useESM: true,  // Enable ESM in ts-jest
            tsconfig: 'tsconfig.json',  // Ensure it points to your tsconfig.json
        },
    },
    maxConcurrency: 10,
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],  // Add necessary module file extensions
};
