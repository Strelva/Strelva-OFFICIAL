# Strelva versioning

Strelva has one product version across two repositories:

- The Strelva app repository contains the product and control plane.
- `strelva-marketing` contains the public marketing site and Strelva Labs index.

Both `package.json` files must always contain the same [Semantic
Versioning](https://semver.org/) value. The current version is `0.1.1`.

## Release history

| Version | Meaning |
|---|---|
| `0.1.0` | Initial Strelva baseline |
| `0.1.1` | Strelva Labs introduction |

Before `1.0.0`, minor versions may represent larger product changes and patch
versions may represent smaller public releases. A release that changes only one
repository still advances both package versions because customers experience
Strelva as one product.

## Preparing a release

1. Choose the next SemVer version.
2. Set the same version in both repositories' `package.json` files and the npm
   lockfile in `strelva-marketing`.
3. Add the same release heading to both `CHANGELOG.md` files. Each changelog may
   describe only the changes relevant to its repository.
4. Run `pnpm version:check` in the Strelva app repository or
   `npm run version:check` in
   `strelva-marketing` while both sibling repositories are present.
5. Run each repository's release verification.
6. Tag the release as `strelva-v<version>`, for example `strelva-v0.1.1`.

Do not use the retired `reb-vYYYY.MM.DD.N` tag format for new releases.

## Separate version domains

The product version does not replace the public storefront API contract version.
Routes under `/api/v1/*`, HMAC wire names, and persistent `reb:` keys remain
independently versioned compatibility boundaries. A breaking storefront contract
change requires a new API route family such as `/api/v2/*`, regardless of the
current Strelva product version.
