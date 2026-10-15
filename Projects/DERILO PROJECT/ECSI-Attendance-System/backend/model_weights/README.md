# Face model files

This backend uses the OpenCV Zoo models below with OpenCV's YuNet and SFace APIs:

- `face_detection_yunet_2023mar.onnx` — [OpenCV Zoo model and license](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- `face_recognition_sface_2021dec.onnx` — [OpenCV Zoo model and license](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)

The SFace cosine-similarity cutoff defaults to `0.363`, as in OpenCV Zoo's SFace example. Existing ArcFace templates are not compatible; users must enroll again after this model change.
