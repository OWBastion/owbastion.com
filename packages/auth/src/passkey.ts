import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

export const createPasskeyAuthenticationOptions = (rpId: string) => generateAuthenticationOptions({
  rpID: rpId,
  userVerification: "required",
  timeout: 300_000,
});

export const createPasskeyRegistrationOptions = (input: { rpId: string; accountId: string; userName: string; displayName: string; excludeCredentials?: Array<{ id: string; transports?: string[] }> }) => generateRegistrationOptions({
  rpName: "OWBastion",
  rpID: input.rpId,
  userID: new TextEncoder().encode(input.accountId),
  userName: input.userName,
  userDisplayName: input.displayName,
  attestationType: "none",
  timeout: 300_000,
  excludeCredentials: input.excludeCredentials,
  authenticatorSelection: {
    residentKey: "required",
    userVerification: "required",
  },
});

export const verifyPasskeyRegistration = async (input: { credential: Record<string, unknown>; challenge: string; origin: string; rpId: string }) => {
  const result = await verifyRegistrationResponse({
    response: input.credential as unknown as RegistrationResponseJSON,
    expectedChallenge: input.challenge,
    expectedOrigin: input.origin,
    expectedRPID: input.rpId,
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error("PASSKEY_REGISTRATION_INVALID");
  return {
    credentialId: result.registrationInfo.credential.id,
    publicKey: isoBase64URL.fromBuffer(result.registrationInfo.credential.publicKey),
    counter: result.registrationInfo.credential.counter,
    transports: result.registrationInfo.credential.transports ?? [],
  };
};

export const verifyPasskeyAuthentication = async (input: { credential: Record<string, unknown>; challenge: string; origin: string; rpId: string; storedCredential: { id: string; publicKey: string; counter: number; transports?: string[] } }) => {
  const credential: WebAuthnCredential = {
    id: input.storedCredential.id,
    publicKey: isoBase64URL.toBuffer(input.storedCredential.publicKey),
    counter: input.storedCredential.counter,
    transports: input.storedCredential.transports,
  };
  const result = await verifyAuthenticationResponse({
    response: input.credential as unknown as AuthenticationResponseJSON,
    expectedChallenge: input.challenge,
    expectedOrigin: input.origin,
    expectedRPID: input.rpId,
    credential,
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error("PASSKEY_AUTHENTICATION_INVALID");
  return { credentialId: result.authenticationInfo.credentialID, newCounter: result.authenticationInfo.newCounter };
};

export const passkeyUserHandle = (accountId: string) => isoBase64URL.fromUTF8String(accountId);

export const passkeyUserHandleMatches = (userHandle: string | undefined, accountId: string) =>
  userHandle === undefined || isoBase64URL.toUTF8String(userHandle) === accountId;
