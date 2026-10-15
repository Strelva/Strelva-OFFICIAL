# Connections

Every outside account a business's Systems read from or act on, with whose
account it is and whose provider access carries it
([ADR 0016](../../../../docs/adr/0016-connections-name-whose-account-and-whose-access.md)).

- `contracts.ts`: the shared shapes. `accountHolder` is whose login was
  connected; `accessThrough` is whose approved provider app or project carries
  the calls.
- `providers.ts`: what each provider reads and acts on, its business area, and
  who may hold its account or access.
- `eligibility.ts`: platform access serves every business; an agency's own
  access serves only that agency's clients with the area grant, while that
  agency acts. Strelva Agency is checked like any agency.

Each product that stores outside accounts implements a `ConnectionSource`
next to its own store. The read model composes them; there is no shared table
of every account. A Connection never grants authority by itself.
