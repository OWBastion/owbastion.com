export const userEvidenceObjectKey = (submissionId: string, sha256: string, extension: string) =>
  `uploads/submissions/${submissionId}/${sha256}.${extension}`;
