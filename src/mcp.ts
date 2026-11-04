// The same agent, exposed over MCP so any MCP client (opencode, for one) can drive it.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AnswerError, advance, answerQuestion, courseView, createCourse, listCourses } from "./agent";

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failure = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** `owner` is the signed-in account, null for admin. Every tool is scoped to it. */
export function createMcpServer(env: Env, owner: string | null): McpServer {
  const server = new McpServer({ name: "coursesmash", version: "1.0.0" });

  server.registerTool(
    "create_course",
    {
      description: "Build a new course from a natural-language description of what the learner wants to learn. Returns the course and its first questions. Takes up to a minute or two.",
      inputSchema: { prompt: z.string().min(3).max(2000).describe("What the learner wants to learn, and why") },
    },
    async ({ prompt }) => {
      const id = await createCourse(env, prompt, owner);
      const result = await advance(env, id, owner);
      if (result.status === "error") return failure(`${result.error} Course id: ${id}. Call advance_course to retry.`);
      return text(await courseView(env, id, owner));
    },
  );

  server.registerTool("list_courses", { description: "List all courses with their progress." }, async () => text(await listCourses(env, owner)));

  server.registerTool(
    "get_course",
    {
      description: "Read a course: modules, the current question, concept mastery and the agent's log. Answer keys stay hidden until a question is answered.",
      inputSchema: { course_id: z.string() },
    },
    async ({ course_id }) => {
      const view = await courseView(env, course_id, owner);
      return view ? text(view) : failure("Course not found.");
    },
  );

  server.registerTool(
    "answer_question",
    {
      description: "Submit an answer. For mcq, send the 0-based option index as a string. For short, send the text. Returns the verdict and feedback.",
      inputSchema: { question_id: z.string(), response: z.string().max(4000) },
    },
    async ({ question_id, response }) => {
      try {
        return text(await answerQuestion(env, question_id, response, owner));
      } catch (error) {
        if (error instanceof AnswerError) return failure(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    "advance_course",
    {
      description: "Have the agent read the learner's state and act: write the next questions, add follow-ups or move on. Call when get_course shows needs_agent.",
      inputSchema: { course_id: z.string() },
    },
    async ({ course_id }) => {
      const result = await advance(env, course_id, owner);
      if (result.status === "missing") return failure("Course not found.");
      if (result.status === "error") return failure(result.error ?? "The agent failed.");
      return text({ result: result.status, course: await courseView(env, course_id, owner) });
    },
  );

  return server;
}
