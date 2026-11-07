/**
 * The school this FeeDesk installation belongs to (one school per installation).
 * Stored in the framework's settings table under one key, so it lives in SQL like everything else.
 */
import { getSetting, putSetting } from "@agent-native/core/settings";

import { isGhanaMobile, normalisePhone } from "./phone.js";

const KEY = "feedesk-school";

export interface SchoolSettings {
  schoolName: string;
  termLabel: string;
  /** The school's MoMo number in 0XXXXXXXXX form, or "" when not set. */
  momoNumber: string;
}

export const DEFAULT_SCHOOL: SchoolSettings = { schoolName: "Your school", termLabel: "", momoNumber: "" };

export async function getSchool(): Promise<SchoolSettings> {
  const v = (await getSetting(KEY)) ?? {};
  const str = (x: unknown, d: string) => (typeof x === "string" ? x : d);
  return {
    schoolName: str(v.schoolName, DEFAULT_SCHOOL.schoolName),
    termLabel: str(v.termLabel, DEFAULT_SCHOOL.termLabel),
    momoNumber: str(v.momoNumber, DEFAULT_SCHOOL.momoNumber),
  };
}

export class SchoolSettingsError extends Error {}

/** Saves a partial update. The MoMo number is normalised and must be a Ghana mobile number. */
export async function saveSchool(patch: Partial<SchoolSettings>): Promise<SchoolSettings> {
  const current = await getSchool();
  const next: SchoolSettings = { ...current };
  if (patch.schoolName !== undefined) {
    const name = patch.schoolName.trim();
    if (!name) throw new SchoolSettingsError("The school name can't be empty.");
    next.schoolName = name.slice(0, 120);
  }
  if (patch.termLabel !== undefined) next.termLabel = patch.termLabel.trim().slice(0, 60);
  if (patch.momoNumber !== undefined) {
    const n = normalisePhone(patch.momoNumber);
    if (n && !isGhanaMobile(n)) {
      throw new SchoolSettingsError(`"${patch.momoNumber}" isn't a Ghana mobile number like 0244123456 or 233244123456.`);
    }
    next.momoNumber = n;
  }
  await putSetting(KEY, { ...next });
  return next;
}
