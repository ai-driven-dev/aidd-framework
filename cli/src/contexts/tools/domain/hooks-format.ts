/**
 * Which shape a tool wants its hooks file in.
 *
 * Named after the shape and not after the tool that first used it: `matchers` nests
 * items under an event and a matcher, `flat` lists them directly under the event. A
 * seventh tool choosing one of these declares it without a name being added here.
 *
 * The name is a tool's declaration; converting to it is translation. Keeping the two in
 * one module would make a tool profile import the context that translates for it, which
 * is the one direction the chain forbids.
 */
export type HooksContentFormat = "matchers" | "flat";
