# Assign your team

[Internal 1.0 draft](../README.md). Give each person access to the clients they serve.

## Prepared for 1.0

1. An agency owner or admin opens **Team**, enters the person's email and agency
   role, and creates an invitation. Share the private link; this action does not
   send email. The person accepts using the invited, confirmed email.
2. Open that person's **Client assignments** and choose their clients. Only
   clients with an active provider seat appear. Use **Assign several people or
   clients** to add or remove up to 200 assignments in one transaction.
3. Team lists each person's assigned clients. Remove a client assignment when
   their work ends. **Remove staff** asks for confirmation and ends all their
   agency client assignments. Rejoining does not restore those assignments.

Owners and admins can change Member/Admin agency roles. Owner memberships and
your own membership are protected in this surface. Agency roles do not select
different permissions per client: assigned staff use the existing provider-seat
operator role. Direct customer membership and separately granted work retain
their own authority. Do not grant business-owner access to staff as a workaround.

This is locally tested implementation on `a1/agency-team`, behind the workspace
and Systems release flags. It is not deployed or proof of actual staff use.
After a failed or unconfirmed change, reload Team before changing it again.

Client contact and inquiry access also depends on the decision in #241.
