/** Consume Chat Completions SSE without losing JSON split across network chunks. */
export async function readGatewayText(response: Response): Promise<string> {
  if (!response.body) throw new Error("AI returned no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = false;
  const consume = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data === "[DONE]") { completed = true; return; }
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(typeof chunk.error.message === "string" ? chunk.error.message : "AI stream failed");
    for (const choice of chunk.choices ?? []) {
      if (typeof choice.delta?.content === "string") text += choice.delta.content;
      if (choice.finish_reason) completed = true;
    }
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!completed || !text.trim()) throw new Error("AI response was interrupted. Please try again.");
    return text;
  } finally { reader.releaseLock(); }
}