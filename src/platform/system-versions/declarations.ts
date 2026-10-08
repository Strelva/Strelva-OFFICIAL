import { z } from "zod";
import { assertShareableDefinition, type JsonObject } from "./compare";
import { VersionDeclarationError } from "./types";

const identifier = z.string().max(160).regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/);
const unique = <T extends z.ZodType<string>>(item: T) => z.array(item).max(200)
  .refine(values => new Set(values).size === values.length, "Declaration entries must be unique.");
const record = z.enum(["application_records", "business_owner", "business_contacts", "business_people"]);
const egress = z.object({
  destination: z.enum(["email_provider", "business_owner_email", "assigned_person_email", "shared_application_view"]),
  fields: unique(identifier),
}).strict();

/** Permissions describe possible behavior, including gated behavior. They never
 * grant access, replace an owner decision, or contain local values/accounts. */
export const packageDeclarationSchema = z.object({
  schemaVersion: z.literal(1),
  recordsRead: unique(record),
  recordsWritten: unique(record),
  businessFields: z.object({ read: unique(identifier), written: unique(identifier) }).strict(),
  outsideEffects: unique(z.enum(["email", "publish", "google", "payment"])),
  bindingKinds: unique(identifier),
  dataEgress: z.array(egress).max(4).refine(values => new Set(values.map(value => value.destination)).size === values.length),
}).strict();

export type PackageDeclaration = z.infer<typeof packageDeclarationSchema>;

// This is a deliberately closed, versioned behavior grammar, not a scan for
// suspicious strings. Keep it aligned with applicationSpecSchema and the SQL
// inspector. Platform code must not import the applications product runtime.
const fieldId = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
  .refine(value => value !== "constructor" && value !== "prototype");
const fieldBase = { id: fieldId, label: z.string().trim().min(1).max(80), required: z.boolean() };
const fieldSchema = z.discriminatedUnion("type", [
  z.object({ ...fieldBase, type: z.literal("text") }).strict(),
  z.object({ ...fieldBase, type: z.literal("number") }).strict(),
  z.object({ ...fieldBase, type: z.literal("boolean") }).strict(),
  z.object({ ...fieldBase, type: z.literal("date") }).strict(),
  z.object({ ...fieldBase, type: z.literal("contact") }).strict(),
  z.object({ ...fieldBase, type: z.literal("assigned_person") }).strict(),
  z.object({ ...fieldBase, type: z.literal("select"),
    options: z.array(z.string().min(1).max(80).refine(value => value === value.trim())).min(1).max(20)
      .refine(values => new Set(values).size === values.length) }).strict(),
]);
const nativeDefinition = z.object({
  kind: z.literal("internal_app"),
  title: z.string().trim().min(1).max(160),
  fields: z.array(fieldSchema).min(1).max(30),
  components: z.array(z.object({ kind: z.enum(["form", "list", "detail", "document"]),
    fields: z.array(fieldId).min(1).max(30) }).strict()).min(1).max(12),
  // Metadata is parsed separately. It is never evidence of effective behavior.
  declaration: z.unknown().optional(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.fields.map(field => field.id));
  if (ids.size !== value.fields.length || value.fields.filter(field => field.type === "assigned_person").length > 1
    || value.components.some(component => component.fields.some(id => !ids.has(id)))) {
    ctx.addIssue({ code: "custom", message: "The package fields or components are invalid." });
  }
});

const sorted = (values: string[]) => [...new Set(values)].sort();

/** Inspect the supported executable definition, never caller-provided claims.
 * Unknown kinds and extra behavior keys fail closed, including missing kind. */
export function inferPackageDeclaration(definition: JsonObject): PackageDeclaration {
  const parsed = nativeDefinition.safeParse(definition);
  if (!parsed.success) throw new VersionDeclarationError("This package does not have a supported, inspectable application definition.");
  const spec = parsed.data;
  const contact = spec.fields.some(field => field.type === "contact");
  const assigned = spec.fields.some(field => field.type === "assigned_person");
  const values = spec.fields.map(field => `application_records.values.${field.id}`);
  const read = ["application_records.id", "business_owner.email", "business_owner.name", ...values];
  const written = ["application_records.id", ...values];
  if (contact) {
    read.push(...["id", "name", "email", "phone", "phone_key"].map(field => `business_contacts.${field}`));
    written.push(...["name", "email", "phone", "source"].map(field => `business_contacts.${field}`));
  }
  if (assigned) read.push(...["id", "name", "email", "active"].map(field => `business_people.${field}`));
  const identity = ["application_records.id", "application.title", "application.work_id", "business.workspace_id"];
  // A submit notice can email the owner even without an assigned_person field.
  // The first nonempty text value and first missing optional label can appear.
  const email = sorted([...identity, "business_owner.email",
    ...spec.fields.filter(field => field.type === "text").map(field => `application_records.values.${field.id}`),
    ...spec.fields.filter(field => !field.required && field.type !== "assigned_person").map(field => `application.labels.${field.id}`),
    ...(assigned ? ["business_people.name", "business_people.email"] : []),
  ]);
  const visible = new Set(spec.components.flatMap(component => component.fields));
  // Field definitions themselves are emitted even for a form-only recipient
  // with no record-read grant. Labels and select options can hold business data.
  const shared = sorted([...identity, "application.release_version", "application_records.revision",
    ...[...visible].flatMap(id => [`application_records.values.${id}`, `application.labels.${id}`]),
    ...spec.fields.filter(field => field.type === "select" && visible.has(field.id)).map(field => `application.options.${field.id}`),
    ...(spec.fields.some(field => field.type === "contact" && visible.has(field.id)) ? ["business_contacts.name", "business_contacts.email", "business_contacts.phone"] : []),
    ...(spec.fields.some(field => field.type === "assigned_person" && visible.has(field.id)) ? ["business_people.name", "business_people.email"] : []),
  ]);
  return {
    schemaVersion: 1,
    recordsRead: ["application_records", "business_owner", ...(contact ? ["business_contacts" as const] : []), ...(assigned ? ["business_people" as const] : [])].sort() as PackageDeclaration["recordsRead"],
    recordsWritten: ["application_records", ...(contact ? ["business_contacts" as const] : [])],
    businessFields: { read: sorted(read), written: sorted(written) },
    outsideEffects: ["email"],
    bindingKinds: [],
    dataEgress: [
      { destination: "email_provider", fields: email },
      { destination: "business_owner_email", fields: email },
      ...(assigned ? [{ destination: "assigned_person_email" as const, fields: email }] : []),
      { destination: "shared_application_view", fields: shared },
    ].sort((a, b) => a.destination.localeCompare(b.destination)) as PackageDeclaration["dataEgress"],
  };
}

export function readPackageDeclaration(value: unknown): PackageDeclaration {
  const parsed = packageDeclarationSchema.safeParse(value);
  if (!parsed.success) throw new VersionDeclarationError("Publish and adopt a source revision with a complete package declaration before releasing.");
  return parsed.data;
}

export function assertDeclaredPackageBehavior(definition: JsonObject, authority: unknown, bindingKinds: readonly string[]): PackageDeclaration {
  assertShareableDefinition(definition);
  const declared = readPackageDeclaration(authority);
  const actual = inferPackageDeclaration(definition);
  const contains = (required: readonly string[], allowed: readonly string[]) => required.every(value => allowed.includes(value));
  const checks = [
    contains(actual.recordsRead, declared.recordsRead), contains(actual.recordsWritten, declared.recordsWritten),
    contains(actual.businessFields.read, declared.businessFields.read), contains(actual.businessFields.written, declared.businessFields.written),
    contains(actual.outsideEffects, declared.outsideEffects), contains(actual.bindingKinds, declared.bindingKinds),
    contains(bindingKinds, declared.bindingKinds) && contains(declared.bindingKinds, bindingKinds),
    actual.dataEgress.every(flow => {
      const allowed = declared.dataEgress.find(entry => entry.destination === flow.destination);
      return Boolean(allowed && contains(flow.fields, allowed.fields));
    }),
  ];
  if (checks.some(check => !check)) throw new VersionDeclarationError("This Version's effective behavior exceeds its source revision's package declaration. Publish and adopt an updated declaration first.");
  return declared;
}

/** Derive publication metadata only at the authoring boundary, never release. */
export function declareApplicationPackage(definition: JsonObject): JsonObject {
  assertShareableDefinition(definition);
  return { ...definition, declaration: inferPackageDeclaration(definition) } as JsonObject;
}
