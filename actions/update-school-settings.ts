import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { saveSchool, SchoolSettingsError } from "../server/lib/school.js";

const errors = defineActionErrors("not_signed_in", "bad_setting");

export default defineAction({
  description:
    "Change the school's settings. Pass only what changes: schoolName, termLabel (e.g. \"First term 2026/27\"), momoNumber (the school's own MoMo number; any Ghana format, saved as 0XXXXXXXXX; \"\" clears it). The MoMo number is needed to import MTN statements.",
  schema: z.object({
    schoolName: z.string().max(120).optional().describe("The school's name as it should appear on screen"),
    termLabel: z.string().max(60).optional().describe('The current term, e.g. "First term 2026/27"'),
    momoNumber: z.string().max(20).optional().describe('The school\'s MoMo number, e.g. "0559000111" or "233559000111"; "" to clear'),
  }),
  outputSchema: z.object({ schoolName: z.string(), termLabel: z.string(), momoNumber: z.string(), message: z.string() }),
  errors,
  run: async (args, ctx) => {
    if (!ctx?.userEmail) return errors.noWrite("Sign in to change the school settings.", "not_signed_in", { statusCode: 401 });
    try {
      const saved = await saveSchool({
        ...(args.schoolName !== undefined ? { schoolName: args.schoolName } : {}),
        ...(args.termLabel !== undefined ? { termLabel: args.termLabel } : {}),
        ...(args.momoNumber !== undefined ? { momoNumber: args.momoNumber } : {}),
      });
      return { ...saved, message: `Saved: ${saved.schoolName}${saved.termLabel ? `, ${saved.termLabel}` : ""}${saved.momoNumber ? `, MoMo ${saved.momoNumber}` : ""}.` };
    } catch (e) {
      if (e instanceof SchoolSettingsError) return errors.noWrite(e.message, "bad_setting");
      throw e;
    }
  },
});
