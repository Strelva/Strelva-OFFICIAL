interface DispatchGoogleGrant {
 status: string;
 bindingId: string | null;
 accessToken: string | null;
 refreshToken: string | null;
 bindingUpdatedAt?: string;
}
import type { AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";
/** Equivalent timestamp encodings must retain PostgreSQL's fractional precision. */
function generation(value:string):string|null {
 const millis=Date.parse(value);
 if(!Number.isFinite(millis))return null;
 const fraction=/\.(\d+)(?=Z$|[+-]\d{2}(?::?\d{2})?$)/.exec(value)?.[1]??"";
 return `${Math.floor(millis/1000)}:${fraction.padEnd(9,"0")}`;
}
export function assertGoogleDispatchGrant(captured:DispatchGoogleGrant,current:DispatchGoogleGrant|null,binding:AccountBindingWithSecrets|null,workspaceId:string,locationId:string):void {
 if(!current || current.status!=="connected" || current.bindingId!==captured.bindingId || current.accessToken!==captured.accessToken || current.refreshToken!==captured.refreshToken)throw new Error("Google grant changed before dispatch.");
 if(captured.bindingId && (!binding || binding.id!==captured.bindingId || binding.workspaceId!==workspaceId || binding.status!=="connected" || !binding.locations.some(value=>value.locationId===locationId)))throw new Error("Google location authority ended before dispatch.");
 if(captured.bindingUpdatedAt && (!binding || !generation(captured.bindingUpdatedAt) || generation(binding.updatedAt)!==generation(captured.bindingUpdatedAt)))throw new Error("Google grant generation changed before dispatch.");
}
