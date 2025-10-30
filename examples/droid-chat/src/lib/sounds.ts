import { createAudio } from "./audio";

export const openSound = createAudio("/sounds/WindowOpen.mp3", 0.3);
export const closeSound = createAudio("/sounds/WindowClose.mp3", 0.3);
export const dragLoopSound = createAudio("/sounds/WindowMoveMoving.mp3", 0.3, { loop: true });
export const dragStopSound = createAudio("/sounds/WindowMoveStop.mp3", 0.3);
export const resizeLoopSound = createAudio("/sounds/WindowMoveMoving.mp3", 0.3, { loop: true },);
export const resizeStopSound = createAudio("/sounds/WindowMoveStop.mp3", 0.3);
export const chimeSound = createAudio("/sounds/ChimeChord.mp3", 0.35);

