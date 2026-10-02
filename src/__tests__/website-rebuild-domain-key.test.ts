import { describe, expect, it } from "vitest";
import { registrableRebuildDomain } from "@/products/websites/rebuild-domain-key";

describe("website rebuild registrable-domain boundary", () => {
  it.each([
    ["www.business.com", "business.com"], ["bookings.business.co.uk", "business.co.uk"], ["office.business.com.au", "business.com.au"],
    ["WWW.BUSINESS.COM.", "business.com"], ["www.bücher.de", "xn--bcher-kva.de"], ["127.0.0.1", "127.0.0.1"], ["[::1]", "[::1]"],
    ["www.business.unknown-tld", "business.unknown-tld"], ["localhost", "localhost"],
  ])("normalizes %s to %s", (input, expected) => expect(registrableRebuildDomain(input)).toBe(expected));
  it.each([
    ["shop.owner.github.io", "owner.github.io"], ["shop.other.github.io", "other.github.io"],
    ["shop.owner.blogspot.com", "owner.blogspot.com"], ["cdn.owner.cloudfront.net", "owner.cloudfront.net"],
  ])("isolates private registry business %s", (input, expected) => expect(registrableRebuildDomain(input)).toBe(expected));
  it("applies wildcard rules without merging separately registrable businesses", () => {
    expect(registrableRebuildDomain("shop.first.foo.ck")).toBe("first.foo.ck");
    expect(registrableRebuildDomain("shop.second.foo.ck")).toBe("second.foo.ck");
    expect(registrableRebuildDomain("a.first.kawasaki.jp")).toBe("a.first.kawasaki.jp");
  });
  it("applies wildcard exceptions at the prevailing public suffix", () => {
    expect(registrableRebuildDomain("shop.www.ck")).toBe("www.ck");
    expect(registrableRebuildDomain("www.city.kawasaki.jp")).toBe("city.kawasaki.jp");
    expect(registrableRebuildDomain("office.city.kawasaki.jp")).toBe("city.kawasaki.jp");
  });
});
