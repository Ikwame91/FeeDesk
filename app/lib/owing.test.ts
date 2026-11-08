import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ghsToPesewas, pesewasToGhs } from "../../server/lib/money";
import { owingList, type FeeStudent } from "./owing";

const student = (name: string, balanceGhs: string, id = name): FeeStudent => ({
  id,
  name,
  className: "Basic 1",
  termFeeGhs: "1000.00",
  paidGhs: pesewasToGhs(100000 - ghsToPesewas(balanceGhs.replace("-", ""))),
  balanceGhs,
});

describe("owingList", () => {
  it("keeps only students with a balance, largest first, and sums in pesewas", () => {
    const { rows, totalGhs } = owingList([
      student("Ama", "0.00"),
      student("Kojo", "-20.00"),
      student("Esi", "150.00"),
      student("Yaw", "600.00"),
      student("Abena", "600.00"),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Abena", "Yaw", "Esi"]);
    expect(totalGhs).toBe("1350.00");
  });

  it("matches the demo end state: 12 students owing GHS 5,000.00", () => {
    const key = JSON.parse(readFileSync(join(__dirname, "../../seed/answer-key.json"), "utf8")) as {
      students_owing: { student_id: string; name: string; balance_ghs: string }[];
    };
    const listed = owingList(
      key.students_owing.map((row) => student(row.name, row.balance_ghs, row.student_id)),
    );
    expect(listed.rows).toHaveLength(12);
    expect(listed.totalGhs).toBe("5000.00");
  });
});