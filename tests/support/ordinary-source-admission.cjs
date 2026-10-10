exports.ordinarySourceCase = "ordinary customer and agency owners author private sources and recipient owners accept separate native Versions";
exports.ordinarySourcePreflight = function (env) {
 for (const key of ['STRELVA_LOCAL_AUTH_PROOF','STRELVA_WORKSPACE_RELEASE','STRELVA_SYSTEMS_RELEASE','STRELVA_NEEDS_YOU_RELEASE'])
  if (env[key] !== '1') throw new Error(`Ordinary source local proof requires ${key}=1.`);
 for (const key of ['PLAYWRIGHT_BASE_URL','NEXT_PUBLIC_SUPABASE_URL','STRELVA_LOCAL_DB_URL']) {
  const url = new URL(env[key] || '');
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.port || (key === 'STRELVA_LOCAL_DB_URL' ? url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' : url.protocol !== 'http:' || Boolean(url.username || url.password || url.search || url.hash))) throw new Error('Ordinary source local proof requires owned loopback services.');
 }
 for (const [key,value] of Object.entries(env))
  if (value && /^(STRIPE_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|EMAIL_PROVIDER_API_KEY|SENDGRID_API_KEY|MAILGUN_API_KEY|POSTMARK_SERVER_TOKEN|BREVO_API_KEY)$/.test(key)) throw new Error('Ordinary source proof forbids provider credentials.');
 for (const key of ['EMAIL_SENDING_ENABLED','CUSTOMER_EMAIL_ENABLED','OPERATOR_EMAILS_ENABLED','PROSPECT_EMAILS_ENABLED'])
  if (env[key] !== 'false') throw new Error('Ordinary source proof keeps external mail held.');
 return true;
};
