const release = document.getElementById("release");
const phoneLayout = window.matchMedia("(max-width: 600px)");
const disclosures = document.querySelectorAll(".mobile-disclosure");
const setDisclosureDefaults = () => {
  disclosures.forEach(disclosure => { disclosure.open = !phoneLayout.matches; });
};
setDisclosureDefaults();

fetch("/api/release", {cache: "no-store"}).then(response => {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
  return response.json();
}).then(result => {
  if (result.schema !== "proofbeforepay-app-source-v2" || !/^[a-f0-9]{64}$/.test(result.sha256) || !Number.isInteger(result.files) || result.files < 1) throw new Error("Invalid");
  release.textContent = `${result.schema}\nSHA-256 ${result.sha256}\n${result.files} covered source, configuration and public text files`;
}).catch(() => {release.textContent = "Fingerprint unavailable. Do not assume source parity. Try /api/release, or inspect the source export manifest.";});
