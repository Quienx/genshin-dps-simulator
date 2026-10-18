import { isIcdGroup } from './icd';
import { expandSystems } from './modules';
import { Block, Condition, Op } from './schema';
import { CharacterData } from '../characterSchema';

// Every resource and status id a file names must exist (in its blocks, its
// set's, its weapon's or its systems'), even behind a flag: a typo would
// otherwise read as 0 or "not active" and silently change the results.
export const validateReferences = (character: CharacterData) => {
  const blocks: Block[] = [
    ...expandSystems(character),
    ...character.blocks,
    ...character.artifactSet.blocks,
    ...character.weapon.blocks,
  ];
  const resources = new Set(
    blocks.filter((block) => block.type === 'resource').map(({ id }) => id)
  );
  const statuses = new Set(
    blocks.filter((block) => block.type === 'status').map(({ id }) => id)
  );

  const fail = (where: string, kind: string, id: string) => {
    throw new Error(
      `${character.name}: ${where} names an unknown ${kind} "${id}"`
    );
  };

  // An ICD group named anywhere (rows, hits, hit ops) must be one of
  // _data/icdGroups.json's.
  const icdGroups = (value: unknown, where: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry) => icdGroups(entry, where));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => {
        if (key === 'icdGroup' && typeof entry === 'string') {
          if (!isIcdGroup(entry)) {
            fail(where, 'ICD group', entry);
          }
        } else {
          icdGroups(entry, where);
        }
      });
    }
  };
  icdGroups(character, 'the file');
  const resource = (where: string, id: string) => {
    if (!resources.has(id)) {
      fail(where, 'resource', id);
    }
  };
  const status = (where: string, id: string) => {
    if (!statuses.has(id)) {
      fail(where, 'status', id);
    }
  };
  const state = (where: string, id: string) => {
    if (!resources.has(id) && !statuses.has(id)) {
      fail(where, 'resource or status', id);
    }
  };

  const condition = (where: string, entry: Condition | undefined) => {
    if (!entry) {
      return;
    }
    if ('resource' in entry) {
      resource(where, entry.resource);
    } else if ('status' in entry) {
      status(where, entry.status);
    } else if ('all' in entry) {
      entry.all.forEach((child) => condition(where, child));
    } else if ('any' in entry) {
      entry.any.forEach((child) => condition(where, child));
    } else if ('not' in entry) {
      condition(where, entry.not);
    }
  };

  const op = (where: string, entry: Op) => {
    condition(where, entry.if);
    if ('addResource' in entry) {
      resource(where, entry.addResource);
      if (typeof entry.amount === 'object' && 'ifStatus' in entry.amount) {
        status(where, entry.amount.ifStatus);
      }
      if (entry.budget) {
        resource(where, entry.budget.resource);
        status(where, entry.budget.whileStatus);
      }
    } else if ('multiplyResource' in entry) {
      resource(where, entry.multiplyResource);
    } else if ('setResource' in entry) {
      resource(where, entry.setResource);
    } else if ('applyStatus' in entry) {
      status(where, entry.applyStatus);
    } else if ('removeStatus' in entry) {
      status(where, entry.removeStatus);
    } else if ('addStack' in entry) {
      status(where, entry.addStack);
    }
  };

  blocks.forEach((block) => {
    const where = `block "${block.id}"`;
    if (block.type === 'trigger') {
      if ('statusStarts' in block.when) {
        status(where, block.when.statusStarts);
      }
      if ('statusEnds' in block.when) {
        status(where, block.when.statusEnds);
      }
      if ('resourceChanges' in block.when) {
        // "party:nightsoul": any member's; a resource of another kit.
        if (!block.when.resourceChanges.startsWith('party:')) {
          resource(where, block.when.resourceChanges);
        }
      }
      condition(where, block.if);
      block.do.forEach((entry) => op(where, entry));
    }
    if (block.type === 'status') {
      if (block.endsWith) {
        status(where, block.endsWith);
      }
      if (block.drain) {
        resource(where, block.drain.resource);
      }
    }
    if (block.type === 'bonus') {
      Object.keys(block.while ?? {}).forEach((id) => state(where, id));
      condition(where, block.if);
      block.perStack?.forEach((factor) => state(where, factor.state));
      if (block.addMultiplier) {
        resource(where, block.addMultiplier.perResource);
      }
    }
  });

  (character.automatic ?? []).forEach((entry) =>
    condition(`automatic entry "${entry.use}"`, entry.if)
  );
  character.actionWarnings.forEach((entry) =>
    condition(`warning on "${entry.action}"`, entry.unless)
  );
  character.actionRules.forEach((rule) => {
    condition(`rule on "${rule.action}"`, rule.requires);
    rule.replacedBy?.forEach((entry) =>
      condition(`rule on "${rule.action}"`, entry.while)
    );
  });
  character.talents.forEach((talent) =>
    talent.forms.forEach((form) => condition(`form "${form.id}"`, form.while))
  );
};
