#!/usr/bin/env bun

import { main } from "../src/cli";

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
