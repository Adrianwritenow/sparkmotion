"use client";

const OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

export function CurrentDate() {
  return <>{new Date().toLocaleDateString("en-US", OPTIONS)}</>;
}
