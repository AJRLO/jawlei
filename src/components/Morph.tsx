import { useState } from "react";
import { FontLabel } from "./LogoMenu";

// Text that melts into the pixel typeface while the pointer is over it, using the same liquid morph as the menu links.
export default function Morph({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  return (
    <span onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)} onFocus={() => setOn(true)} onBlur={() => setOn(false)}>
      <FontLabel text={text} active={on} />
    </span>
  );
}