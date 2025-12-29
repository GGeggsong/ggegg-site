export const API_BASE =
  "https://script.google.com/macros/s/AKfycbzHAxkg1lwl46q0ayjf14z9ZBto9C2OG9rdczknKKG_jtj_LLvHd3FHKmxxUXyoAJjK/exec";

export async function getLetters() {
  const res = await fetch(`${API_BASE}?letters=1`);
  return await res.json();
}

export async function getByLetter(letter) {
  const res = await fetch(`${API_BASE}?letter=${letter}`);
  return await res.json();
}

export async function search(q) {
  const res = await fetch(`${API_BASE}?q=${encodeURIComponent(q)}`);
  return await res.json();
}

export async function getMeta() {
  const res = await fetch(`${API_BASE}?meta=1`);
  return await res.json();
}
