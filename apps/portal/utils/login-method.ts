export type LoginMethod = "passkey" | "qq";

const storageKey = "owbastion-login-method";

export function preferredLoginMethod(): LoginMethod {
  try {
    return localStorage.getItem(storageKey) === "qq" ? "qq" : "passkey";
  } catch {
    return "passkey";
  }
}

export function rememberLoginMethod(method: LoginMethod) {
  try {
    localStorage.setItem(storageKey, method);
  } catch {
    // The preference is a convenience; login must not depend on storage.
  }
}
