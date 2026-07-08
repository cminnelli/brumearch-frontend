import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { environment } from '../environments/environment';

export const firebaseApp = initializeApp(environment.firebase);

const _auth = getAuth(firebaseApp);
setPersistence(_auth, browserLocalPersistence).catch(() => {});
