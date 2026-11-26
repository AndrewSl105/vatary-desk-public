---
name: no-flags-system-decides
description: Don't add env vars or feature flags for new behaviour; the system decides from the data it already has
metadata:
  type: feedback
---

Don't gate new AI behaviour behind new env vars or rollout flags, even when a brief asks for flags. Make the new behaviour the default and let the system decide when it applies from the data it already has.

**Why:** the owner pushed back on a growing pile of configuration: a large operation should get full planning by default, and the system should judge the scope by itself.

**How to apply:** prefer a code rule over the measured input (scope size, estimate, caps) to a switch. A big operation gets the plan; a small one builds straight away. Add a configuration knob only when asked.
