/**
 * Which shape a tool wants its hooks file in, named after the shape and not the tool that first
 * used it: `matchers` nests items under an event and a matcher, `flat` lists them directly under
 * the event. The name is a tool's declaration and converting to it is translation; keeping the
 * two in one module would make a tool profile import the context that translates for it, the one
 * direction the chain forbids.
 */
export type HooksContentFormat = "matchers" | "flat";
