/* A render takes about a second, so it runs here and the page stays responsive. */
importScripts("kissifier.js");

onmessage = ({ data: { id, alpha, width, height, recipe, color } }) => {
  const print = Kissifier.render(Kissifier.shape(alpha, width, height), recipe, color);
  postMessage({ id, width: print.width, height: print.height, data: print.data }, [print.data.buffer]);
};
