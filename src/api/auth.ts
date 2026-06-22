import {
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

import { auth } from '@/firebase';
import type { SignInInput, SignUpInput } from '@/schemas';

export async function signInWithEmail({ email, password }: SignInInput) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail({ name, email, password }: SignUpInput) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, {
    displayName: name,
  });

  return credential;
}

export async function signInAsGuest() {
  return signInAnonymously(auth);
}

export async function logout() {
  return signOut(auth);
}
