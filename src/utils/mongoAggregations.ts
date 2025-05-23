export function lookupCollectionDetails({
  localField,
  foreignField,
  asField,
  from,
  preserveNull = true,
}: {
  localField?: string;
  foreignField?: string;
  asField?: string;
  from?: string;
  preserveNull?: boolean;
}) {
  return [
    {
      $lookup: {
        from,
        localField,
        foreignField,
        as: asField,
      },
    },
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];
}
