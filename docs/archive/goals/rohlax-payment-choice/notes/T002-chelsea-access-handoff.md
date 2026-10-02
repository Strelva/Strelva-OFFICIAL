# Chelsea Access Handoff

## What Chelsea Gets

Chelsea should receive two things:

1. The flexible website payment page:
   `https://strelva.com/pay/rohlax`

2. Rohlax admin/dashboard access, tied to her exact email address through the existing invite system.

## Important Access Rules

- The payment page is public and can be sent as a normal link.
- The admin site is guaranteed free for life.
- Admin access does not depend on whether she pays.
- Payment does not change future response times.
- Payment does not include extra coverage right now.
- Website requests stay in the normal 3-5 day response window.

## How To Give Chelsea Admin Access

1. Get Chelsea's exact email address.
2. Open `/admin` as a super admin.
3. Find the `rohlax` / `Rohlax Wellness` tenant row.
4. Click `Invite`.
5. Enter Chelsea's exact email address.
6. Send the invite.
7. If email delivery fails, copy the manual sign-up link shown in the invite modal and send it to Chelsea directly.

The invite route is `/api/admin/invites`. If Chelsea already has a Clerk account, the route assigns her to the `rohlax` tenant immediately. If she does not, it stores a 30-day pending invite and sends/signposts the tenant sign-up link.

## What Chelsea Should Do

Chelsea must sign up or sign in with the exact email that received the invite. After the invite is claimed, she should land in the Rohlax dashboard.

If she uses the wrong account, send her to the account/no-access recovery flow and have her choose `Use invited email`.

## Message To Chelsea

Hi Chelsea,

Here are the two links for the website handoff:

Payment page:
https://strelva.com/pay/rohlax

Admin access:
[INSERT INVITE SIGN-UP LINK]

Please use the same email address this invite was sent to when you sign in or create your account. Your admin site access is guaranteed free for life.

The payment page is only there as a flexible courtesy payment option. It is not required for admin access, it will not affect future response times, and it does not include extra coverage at this moment. Website requests will still fall within the normal 3-5 day response window.

Thank you,
Jacob

## Missing Detail

Chelsea's exact email address is not present in the local repo files I checked. Do not create the invite until that email is confirmed.
