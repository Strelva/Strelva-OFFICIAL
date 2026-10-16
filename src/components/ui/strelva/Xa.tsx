/**
 * The XA kit (October 15, 2026): one import for every lane.
 *
 *   import { XaButton, XaComposer, XaYes, ... } from "@/components/ui/strelva/Xa";
 *
 * API, Pen node per part and the anti-slop checklist:
 * design-notes/XA-FOUNDATION.md. The St* kit in ./Kit stays exported and is
 * restyled to the same LX look, so existing screens keep working while lanes
 * move to these parts.
 */
export { XaButton, XaButtonLink, XaIconButton, XaTextLink, type XaButtonSize, type XaButtonVariant } from "./xa/actions";
export { XaDot, XaInitial, xaInitialOf, XaKbd, XaMark, XaStatus, type XaStatusKind } from "./xa/state";
export { XA_POSES, XA_SYSTEM_KINDS, XaAddTile, XaPebbleAvatar, XaPebbleScene, XaSystemTile, xaSystemKind, type XaPose, type XaSystemKind } from "./xa/characters";
export { XaComposer, XaWaiting, type XaComposerScope, type XaComposerSystem, type XaWaitingItem } from "./xa/composer";
export { XaStream, XaWorking, type XaWorkingStep } from "./xa/working";
export { XaDecision, XaUndo, XaUndoDock, XaYes, type XaYesState } from "./xa/yes";
export { XaAnswers, XaEmpty, XaHeadline, XaLabel, XaLede, XaLines, XaPage, XaPageChange, XaRow, XaRows, XaSays, XaSheet } from "./xa/surfaces";
export { XaChoices, XaDoors, XaField, XaSegmented, XaSelect, XaTextArea, type XaOption } from "./xa/inputs";
export { XaCollapse, XaGlideList, XaRollingCount } from "./xa/motion";
export { StComposerDock as XaComposerDock } from "./Kit";
export { XaEntry, XaEntryBrand, XaEntryBrokenLink, XaEntryCaption, XaEntryDoors, XaEntryFelt, XaEntryFrame, XaEntryNote, XaEntryPebbleLine, XaEntryStack, XaEntrySteps, type XaEntryStage } from "./xa/entry";
export { XaChecklist, type XaChecklistItem } from "./xa/checklist";
