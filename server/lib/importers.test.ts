import { describe, expect, it } from "vitest";

import { ImportError, parseBankCsv, parseMomoCsv, parseReceiptsCsv, parseStudentsCsv } from "./importers";

describe("CSV importers store GHS as integer pesewas", () => {
  it("students: term fee 450.50 → 45050", () => {
    const s = parseStudentsCsv(
      "student_id,full_name,class,term_fee_ghs,parent_name,parent_phone\nS001,Ama Owusu,JHS 1,450.50,Kofi Owusu,+233 24 123 4417\n",
    )[0]!;
    expect(s.termFeePesewas).toBe(45050);
    expect(s.parentPhone).toBe("0241234417");
  });

  it("MoMo: amount 450.50 → 45050, splits date and time, skips failed lines", () => {
    const rows = parseMomoCsv(
      'Transaction ID,Date/Time,Transaction Type,From Name,From Number,Amount (GHS),Fees (GHS),Balance (GHS),Reference,Status\n' +
        '111,2026-10-14 10:07:59,PAYMENT RECEIVED,KOFI OWUSU,0241234417,450.50,0.00,"1,000.00",Ama fees,SUCCESSFUL\n' +
        "222,2026-10-14 11:00:00,PAYMENT RECEIVED,YAW MENSAH,0201111111,100.00,0.00,1100.00,,FAILED\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountPesewas: 45050, date: "2026-10-14", time: "10:07:59", txnId: "111" });
  });

  it("bank: credit 450.50 → 45050, debits skipped", () => {
    const rows = parseBankCsv(
      "Date,Description,Reference,Debit (GHS),Credit (GHS),Balance (GHS)\n" +
        "2026-10-15,CASH DEPOSIT,DEP1,,450.50,1000.00\n" +
        "2026-10-16,BANK CHARGES,CHG1,10.00,,990.00\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountPesewas: 45050, txnId: "DEP1", source: "bank" });
  });

  it("receipts: amount 450.50 → 45050", () => {
    const r = parseReceiptsCsv(
      "receipt_no,date,student_id,student_name,class,amount_ghs,method\n1050,2026-11-02,S001,Ama Owusu,JHS 1,450.50,cash\n",
    )[0]!;
    expect(r.amountPesewas).toBe(45050);
  });

  it("rejects the whole file with row numbers when a row is bad", () => {
    expect(() =>
      parseReceiptsCsv(
        "receipt_no,date,student_id,amount_ghs,method\n1,2026-11-02,S001,12.345,cash\n2,02/11/26,S001,10,cash\n",
      ),
    ).toThrow(ImportError);
    try {
      parseReceiptsCsv("receipt_no,date,student_id,amount_ghs,method\n1,2026-11-02,S001,12.345,cash\n");
    } catch (e) {
      expect((e as ImportError).problems[0]).toMatch(/^row 2:/);
    }
  });
});
