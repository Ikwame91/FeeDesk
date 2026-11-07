# Test fixtures (fictional)

`mtn-momo-statement.csv`: an invented statement in MTN MoMo's export layout (column headers taken from a
real export; every value is made up). The school's number in it is **233559000111** (0559000111).
It covers: normal payments in, a 12 AM time, amounts with 0/1/3 decimals, a bank transfer and a
Telecel cross-network payment with the real sender in REF, the school's own cash-out and E-Levy rows
(money going out), and a payment to a different number. Expected: 5 lines imported, 3 left out.
