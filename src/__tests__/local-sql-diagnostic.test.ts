import { describe, expect, it } from "vitest";
import { localSqlFailure } from "../../tests/support/sql-diagnostic";
describe("local SQL fixture diagnostics", () => {
  const url = "postgresql://fixture:top%24secret@127.0.0.1:5432/disposable";
  it("retains the actionable SQL error without the command, database URL or encoded/decoded password", () => {
    const error = localSqlFailure({ status: 1, message: `Command failed: psql ${url}`, stderr: Buffer.from(`ERROR: column u.booking_id does not exist\nLINE 4: private fixture SQL\nHINT: ${url} top$secret top%24secret\n`) }, url);
    expect(error.message).toContain("column u.booking_id does not exist");
    expect(error.message).toContain("exit 1");
    for (const secret of [url, "top$secret", "top%24secret", "Command failed", "private fixture SQL"]) expect(error.message).not.toContain(secret);
    expect(error.cause).toBeUndefined();
  });
  it("bounds stderr and discards unsafe message-only failures", () => {
    expect(localSqlFailure({ stderr: `ERROR: ${"x".repeat(5000)}` }, url).message.length).toBeLessThan(1100);
    expect(localSqlFailure({ message: `psql ${url}` }, url).message).toContain("No safe SQL diagnostic");
  });
  it("redacts alternate database URLs and password options", () => {
    const error = localSqlFailure({ stderr: "FATAL: postgresql://other:different@localhost/db password=another" }, url);
    expect(error.message).not.toContain("different");
    expect(error.message).not.toContain("another");
  });
});
