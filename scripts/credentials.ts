import {bootstrapCredentials,credentialsPath} from '../server/credentials.js';
const credentials=bootstrapCredentials();
console.log(`Private local credentials (${credentialsPath})\nKeep these out of recordings, screenshots, and source control.\n\nAdmin key: ${credentials.adminKey}\nStore ID: ${credentials.storeId}\nSimulator store key: ${credentials.apiKey}`);
