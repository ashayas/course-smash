const error = new URLSearchParams(location.search).get("error");
const box = document.getElementById("error");
if (error) {
  box.textContent = error === "slow" ? "Too many tries. Wait a minute and try again." : "That username or password isn't right.";
  box.hidden = false;
}
