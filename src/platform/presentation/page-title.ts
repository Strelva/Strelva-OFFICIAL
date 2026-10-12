/** Keep an opened object's title current when Next streams route metadata later.
 * Call inside a client effect and return its cleanup on navigation/unmount. */
export function keepPageTitle(title: string): () => void {
  const applyTitle = () => { if (document.title !== title) document.title = title; };
  const observer = new MutationObserver(applyTitle);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  applyTitle();
  return () => observer.disconnect();
}
