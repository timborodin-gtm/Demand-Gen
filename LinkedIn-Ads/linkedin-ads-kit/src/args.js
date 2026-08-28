export function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      args._.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");

    if (equalsIndex !== -1) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1);
      assignArg(args, key, value);
      continue;
    }

    const key = withoutPrefix;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      assignArg(args, key, next);
      index += 1;
    } else {
      assignArg(args, key, true);
    }
  }

  return args;
}

function assignArg(args, key, value) {
  const normalizedKey = key.replaceAll("-", "_");
  if (args[normalizedKey] === undefined) {
    args[normalizedKey] = value;
    return;
  }

  if (!Array.isArray(args[normalizedKey])) {
    args[normalizedKey] = [args[normalizedKey]];
  }

  args[normalizedKey].push(value);
}

export function getArg(args, name, fallback = undefined) {
  const value = args[name] ?? args[name.replaceAll("-", "_")];
  return value === undefined ? fallback : value;
}
